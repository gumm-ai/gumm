-- Add VPN networking fields to devices table
ALTER TABLE devices ADD COLUMN vpn_ip TEXT;
--> statement-breakpoint
ALTER TABLE devices ADD COLUMN vpn_type TEXT;
--> statement-breakpoint
ALTER TABLE devices ADD COLUMN vpn_pubkey TEXT;
--> statement-breakpoint
ALTER TABLE devices ADD COLUMN internal_port INTEGER;
