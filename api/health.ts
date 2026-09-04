export default function health(_req: any, res: any) {
  const payload = { ok: true, service: "rbxis" };
  if (typeof res.status === "function") {
    res.status(200).json(payload);
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}
