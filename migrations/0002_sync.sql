-- End-to-end encrypted sync for CrossEFB.
--
-- Each row is one sync group. `id` is SHA-256 of the sync code (the code never
-- reaches the server), and `blob` is AES-GCM ciphertext made on the device with
-- a key derived from the same code. The server cannot read what it stores.
create table if not exists sync_blobs (
  id text primary key check (char_length(id) = 64),
  blob text not null,
  rev bigint not null default 1,
  updated_at timestamptz not null default now()
);
