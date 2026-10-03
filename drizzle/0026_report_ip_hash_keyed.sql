-- Report IP hashes were plain SHA-256 of the IP, which can be reversed by hashing every IPv4 address.
-- New ones are keyed (src/lib/keyed-hash.ts). The old ones can't be converted without the IPs, and
-- are only used to drop a repeat report within a day, so they're cleared.
UPDATE "report" SET "ip_hash" = '';
