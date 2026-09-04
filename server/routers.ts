import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DURATION_UNITS, OPERATING_SYSTEMS, PERFORMANCE_LEVELS } from "../shared/rbxis";
import {
  createHistory,
  createProductLicense,
  getActiveLicenseSession,
  getAdminStats,
  getLicenseByCredentials,
  getProductLicense,
  listHistoryForUser,
  listProductLicenses,
  deleteProductLicense,
  markLicenseLoggedIn,
  toggleHistoryFavorite,
  updateProductLicense,
} from "./db";
import { clearSessionCookie, getAdminAccessKey, normalizeAdminKey, setSessionCookie } from "./rbxis-auth";
import { publicProcedure, rbxisAdminProcedure, rbxisProcedure, router } from "./_core/trpc";

const durationUnitSchema = z.enum(DURATION_UNITS);
const statusSchema = z.enum(["active", "revoked", "blocked"]);

function normalizeDeviceId(value: string) {
  return value.trim().slice(0, 160);
}

function buildSensitivity(seedInput: string) {
  const digest = createHash("sha256").update(seedInput).digest();
  const n = (index: number) => digest[index] ?? 0;
  return {
    general: 88 + (n(0) % 13),
    redDot: 82 + (n(1) % 17),
    scope2x: 76 + (n(2) % 20),
    scope4x: 68 + (n(3) % 24),
    awm: 54 + (n(4) % 30),
  };
}

function addDuration(start: Date, value: number, unit: "days" | "weeks" | "months" | "years") {
  const date = new Date(start);
  if (unit === "days") date.setDate(date.getDate() + value);
  if (unit === "weeks") date.setDate(date.getDate() + value * 7);
  if (unit === "months") date.setMonth(date.getMonth() + value);
  if (unit === "years") date.setFullYear(date.getFullYear() + value);
  return date;
}

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      const session = ctx.rbxisSession;
      if (!session) return null;
      if (session.role === "admin") return { role: "admin" as const, username: "SENSIADMIN00", name: "SENSIADMIN00", email: null };
      if (!session.userId || !session.licenseId) return null;
      const row = await getActiveLicenseSession(session.userId, session.licenseId);
      if (!row) return null;
      return {
        role: "user" as const,
        username: row.license.username,
        name: row.license.username,
        email: null,
        planId: row.license.planId,
        expiresAt: row.license.expiresAt,
        deviceId: row.license.deviceId,
      };
    }),
    login: publicProcedure
      .input(z.object({ accessKey: z.string().trim().min(8).max(80), deviceId: z.string().trim().min(8).max(160) }))
      .mutation(async ({ ctx, input }) => {
        const row = await getLicenseByCredentials(input.accessKey, input.accessKey);
        if (!row) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou chave inválidos" });
        if (row.license.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: row.license.status === "blocked" ? "Este acesso foi bloqueado pelo administrador" : "Esta chave foi revogada" });
        if (row.license.expiresAt.getTime() <= Date.now()) throw new TRPCError({ code: "FORBIDDEN", message: "Esta licença expirou" });
        const deviceId = normalizeDeviceId(input.deviceId);
        if (row.license.deviceId && row.license.deviceId !== deviceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Esta licença já está vinculada a outro dispositivo" });
        }
        await markLicenseLoggedIn(row.license.id, deviceId);
        const sessionToken = setSessionCookie(ctx.req, ctx.res, { role: "user", userId: row.user.id, licenseId: row.license.id, username: row.license.username });
        return { success: true as const, username: row.license.username, expiresAt: row.license.expiresAt, sessionToken };
      }),
    adminLogin: publicProcedure
      .input(z.object({ adminKey: z.string().min(1) }))
      .mutation(({ ctx, input }) => {
        if (normalizeAdminKey(input.adminKey) !== normalizeAdminKey(getAdminAccessKey())) throw new TRPCError({ code: "UNAUTHORIZED", message: "Chave de administrador inválida" });
        const sessionToken = setSessionCookie(ctx.req, ctx.res, { role: "admin", username: "SENSIADMIN00" });
        return { success: true as const, username: "SENSIADMIN00", sessionToken };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearSessionCookie(ctx.req, ctx.res);
      return { success: true as const };
    }),
  }),
  generator: router({
    generate: rbxisProcedure
      .input(z.object({ operatingSystem: z.enum(OPERATING_SYSTEMS), device: z.string().min(2).max(100), performance: z.enum(PERFORMANCE_LEVELS) }))
      .mutation(async ({ ctx, input }) => {
        const session = ctx.rbxisSession!;
        if (session.role !== "user" || !session.userId || !session.licenseId) throw new TRPCError({ code: "FORBIDDEN", message: "O gerador é exclusivo para usuários" });
        const active = await getActiveLicenseSession(session.userId, session.licenseId);
        if (!active) throw new TRPCError({ code: "FORBIDDEN", message: "A licença não está ativa" });
        const values = buildSensitivity(`${session.licenseId}:${input.operatingSystem}:${input.device}:${input.performance}`);
        const history = await createHistory({ userId: session.userId, licenseId: session.licenseId, ...input, ...values, favorite: 0 });
        return { values, historyId: history?.id ?? 0 };
      }),
    history: rbxisProcedure.query(async ({ ctx }) => {
      if (ctx.rbxisSession?.role !== "user" || !ctx.rbxisSession.userId) return [];
      return listHistoryForUser(ctx.rbxisSession.userId);
    }),
    favorites: rbxisProcedure.query(async ({ ctx }) => {
      if (ctx.rbxisSession?.role !== "user" || !ctx.rbxisSession.userId) return [];
      return listHistoryForUser(ctx.rbxisSession.userId, true);
    }),
    toggleFavorite: rbxisProcedure.input(z.object({ historyId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.rbxisSession?.role !== "user" || !ctx.rbxisSession.userId) throw new TRPCError({ code: "FORBIDDEN", message: "Ação exclusiva para usuários" });
      return toggleHistoryFavorite(ctx.rbxisSession.userId, input.historyId);
    }),
  }),
  admin: router({
    stats: rbxisAdminProcedure.query(() => getAdminStats()),
    licenses: rbxisAdminProcedure.query(() => listProductLicenses()),
    createLicense: rbxisAdminProcedure
      .input(z.object({ username: z.string().trim().min(2).max(60), planId: z.string().min(1).max(40), durationValue: z.number().int().min(1).max(3650), durationUnit: durationUnitSchema }))
      .mutation(async ({ input }) => {
        const expiresAt = addDuration(new Date(), input.durationValue, input.durationUnit);
        try {
          return await createProductLicense({ ...input, expiresAt });
        } catch (error) {
          const message = String(error).toLowerCase().includes("duplicate") ? "Esse nome de usuário já existe" : "Não foi possível criar o acesso";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),
    updateLicense: rbxisAdminProcedure
      .input(z.object({ id: z.number().int().positive(), status: statusSchema.optional(), planId: z.string().min(1).max(40).optional(), durationValue: z.number().int().min(1).max(3650).optional(), durationUnit: durationUnitSchema.optional() }))
      .mutation(async ({ input }) => {
        const { id, ...values } = input;
        return updateProductLicense(id, values);
      }),
    revokeLicense: rbxisAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => updateProductLicense(input.id, { status: "revoked" })),
    blockLicense: rbxisAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => updateProductLicense(input.id, { status: "blocked" })),
    resetDevice: rbxisAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => updateProductLicense(input.id, { deviceId: null, lastLoginAt: null })),
    deleteLicense: rbxisAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => deleteProductLicense(input.id)),
    extendLicense: rbxisAdminProcedure.input(z.object({ id: z.number().int().positive(), durationValue: z.number().int().min(1).max(3650), durationUnit: durationUnitSchema })).mutation(async ({ input }) => {
      const license = await getProductLicense(input.id);
      if (!license) throw new TRPCError({ code: "NOT_FOUND", message: "Licença não encontrada" });
      const start = license.expiresAt.getTime() > Date.now() ? license.expiresAt : new Date();
      return updateProductLicense(input.id, { expiresAt: addDuration(start, input.durationValue, input.durationUnit), status: "active" });
    }),
  }),
});

export type AppRouter = typeof appRouter;
