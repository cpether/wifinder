CREATE TABLE locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  address TEXT,
  notes TEXT,
  place_source TEXT NOT NULL DEFAULT 'user_submission',
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE wifi_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  ssid TEXT NOT NULL,
  password TEXT,
  access_notes TEXT,
  time_limits TEXT,
  purchase_required INTEGER NOT NULL DEFAULT 0 CHECK (purchase_required IN (0, 1)),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE wifi_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wifi_detail_id INTEGER NOT NULL REFERENCES wifi_details(id),
  voter_token_hash TEXT NOT NULL,
  vote_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (wifi_detail_id, voter_token_hash)
);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reporter_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_locations_status ON locations(status);
CREATE INDEX idx_locations_category_status ON locations(category, status);
CREATE INDEX idx_wifi_details_location_status ON wifi_details(location_id, status);
CREATE INDEX idx_wifi_votes_wifi_detail_id ON wifi_votes(wifi_detail_id);
CREATE INDEX idx_reports_target ON reports(target_type, target_id);
