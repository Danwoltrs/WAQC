-- Add notifications table for system notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  laboratory_id UUID REFERENCES laboratories(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('info', 'warning', 'success', 'error')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  link TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add activity_feed table for tracking system activities
CREATE TABLE IF NOT EXISTS activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  laboratory_id UUID REFERENCES laboratories(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_name TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_laboratory_id ON notifications(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_notifications_client_id ON notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read) WHERE read = FALSE;

CREATE INDEX IF NOT EXISTS idx_activity_feed_user_id ON activity_feed(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_laboratory_id ON activity_feed(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_client_id ON activity_feed(client_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_actor_id ON activity_feed(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_created_at ON activity_feed(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_entity_type ON activity_feed(entity_type);

-- Add RLS policies for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Lab users can view notifications for their laboratory
CREATE POLICY "Lab users can view their lab notifications"
  ON notifications FOR SELECT
  USING (
    laboratory_id = get_user_qc_laboratory(auth.uid())
    AND get_user_qc_role(auth.uid()) IN ('lab_personnel', 'lab_manager', 'quality_manager', 'santos_hq_finance', 'global_finance_admin', 'global_quality_admin', 'global_admin')
  );

-- Client users can view notifications for their company across all labs
CREATE POLICY "Client users can view their company notifications"
  ON notifications FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE id IN (
        SELECT unnest(client_ids) FROM profiles WHERE id = auth.uid()
      )
    )
    AND get_user_qc_role(auth.uid()) IN ('client', 'supplier', 'buyer')
  );

-- System can insert notifications
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (user_id = auth.uid());

-- Add RLS policies for activity_feed
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

-- Lab users can view activities for their laboratory
CREATE POLICY "Lab users can view their lab activities"
  ON activity_feed FOR SELECT
  USING (
    laboratory_id = get_user_qc_laboratory(auth.uid())
    AND get_user_qc_role(auth.uid()) IN ('lab_personnel', 'lab_manager', 'quality_manager', 'santos_hq_finance', 'global_finance_admin', 'global_quality_admin', 'global_admin')
  );

-- Client users can view activities for their company across all labs
CREATE POLICY "Client users can view their company activities"
  ON activity_feed FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE id IN (
        SELECT unnest(client_ids) FROM profiles WHERE id = auth.uid()
      )
    )
    AND get_user_qc_role(auth.uid()) IN ('client', 'supplier', 'buyer')
  );

-- System can insert activities
CREATE POLICY "System can insert activities"
  ON activity_feed FOR INSERT
  WITH CHECK (true);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for notifications updated_at
DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
