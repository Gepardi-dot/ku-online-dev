-- Create table for logging Vonage SMS messages
CREATE TABLE IF NOT EXISTS vonage_sms_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  delivery_status TEXT,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_vonage_sms_message_id ON vonage_sms_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_vonage_sms_received_at ON vonage_sms_logs(received_at);
CREATE INDEX IF NOT EXISTS idx_vonage_sms_direction ON vonage_sms_logs(direction);
CREATE INDEX IF NOT EXISTS idx_vonage_sms_from_number ON vonage_sms_logs(from_number);
CREATE INDEX IF NOT EXISTS idx_vonage_sms_to_number ON vonage_sms_logs(to_number);

-- Add RLS (Row Level Security) policies
ALTER TABLE vonage_sms_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can read SMS logs
CREATE POLICY "Users can view SMS logs" ON vonage_sms_logs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Policy: Only service role can insert SMS logs (webhook endpoint)
CREATE POLICY "Service role can insert SMS logs" ON vonage_sms_logs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Policy: Only service role can update SMS logs (delivery status updates)
CREATE POLICY "Service role can update SMS logs" ON vonage_sms_logs
  FOR UPDATE USING (auth.role() = 'service_role');

-- Policy: Only service role can delete SMS logs
CREATE POLICY "Service role can delete SMS logs" ON vonage_sms_logs
  FOR DELETE USING (auth.role() = 'service_role');

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_vonage_sms_logs_updated_at
  BEFORE UPDATE ON vonage_sms_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE vonage_sms_logs IS 'Logs for Vonage SMS messages including inbound and outbound messages with delivery tracking';
COMMENT ON COLUMN vonage_sms_logs.message_id IS 'Unique message identifier from Vonage';
COMMENT ON COLUMN vonage_sms_logs.from_number IS 'Sender phone number in E.164 format';
COMMENT ON COLUMN vonage_sms_logs.to_number IS 'Recipient phone number in E.164 format';
COMMENT ON COLUMN vonage_sms_logs.message_text IS 'SMS message content';
COMMENT ON COLUMN vonage_sms_logs.message_type IS 'Message type (text, unicode, binary, etc.)';
COMMENT ON COLUMN vonage_sms_logs.direction IS 'Message direction: inbound or outbound';
COMMENT ON COLUMN vonage_sms_logs.delivery_status IS 'Delivery status from Vonage (delivered, failed, expired, etc.)';
COMMENT ON COLUMN vonage_sms_logs.received_at IS 'When the message was received by the webhook';
COMMENT ON COLUMN vonage_sms_logs.delivered_at IS 'When the message was confirmed delivered';
