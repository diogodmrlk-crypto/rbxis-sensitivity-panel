CREATE TABLE IF NOT EXISTS `product_licenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(60) NOT NULL,
	`accessKey` varchar(80) NOT NULL,
	`planId` varchar(40) NOT NULL,
	`durationValue` int NOT NULL,
	`durationUnit` enum('days','weeks','months','years') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`status` enum('active','revoked','blocked') NOT NULL DEFAULT 'active',
	`deviceId` varchar(160),
	`lastLoginAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_licenses_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_licenses_username_unique` UNIQUE(`username`),
	CONSTRAINT `product_licenses_accessKey_unique` UNIQUE(`accessKey`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sensitivity_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`licenseId` int NOT NULL,
	`operatingSystem` enum('android','ios') NOT NULL,
	`device` varchar(100) NOT NULL,
	`performance` enum('low','medium','high') NOT NULL,
	`general` int NOT NULL,
	`redDot` int NOT NULL,
	`scope2x` int NOT NULL,
	`scope4x` int NOT NULL,
	`awm` int NOT NULL,
	`favorite` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sensitivity_history_id` PRIMARY KEY(`id`)
);
