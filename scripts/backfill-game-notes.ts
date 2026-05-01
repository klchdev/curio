import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const pool = new pg.Pool({ connectionString: url });

const sql = `
INSERT INTO slot_notes (user_id, game_id, text, playtime_minutes, created_at)
SELECT gr.user_id, gr.game_id, gr.note, gr.playtime_minutes, gr.created_at
FROM game_reviews gr
WHERE gr.note IS NOT NULL
  AND length(gr.note) >= 10
  AND NOT EXISTS (
    SELECT 1 FROM slot_notes sn
    WHERE sn.user_id = gr.user_id AND sn.game_id = gr.game_id
  )
RETURNING id;
`;

const res = await pool.query(sql);
console.log(`Inserted ${res.rowCount} backfill rows`);
await pool.end();
