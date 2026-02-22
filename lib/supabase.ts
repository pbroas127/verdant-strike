import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://hozpsvcceeyszunafqsr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvenBzdmNjZWV5c3p1bmFmcXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3OTUwNDcsImV4cCI6MjA4NzM3MTA0N30.GGokcxo3uyOTE_7Yz1r1Hca3ZAjWkAs4gQ06aQwHp6k'
);

export interface Profile {
  id: string;
  username: string;
  created_at: string;
}
