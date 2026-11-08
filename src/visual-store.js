import { randomUUID } from 'node:crypto';

export function createVisualStore(store) {
  const db = store.db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS scrim_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      home_team_id INTEGER NOT NULL REFERENCES teams(id),
      away_team_id INTEGER NOT NULL REFERENCES teams(id),
      created_by TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format IN ('BO3','BO5')),
      start_text TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
      scrim_id INTEGER REFERENCES scrims(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(home_team_id <> away_team_id)
    );
    CREATE INDEX IF NOT EXISTS idx_challenges_guild ON scrim_challenges(guild_id,status);
    CREATE TABLE IF NOT EXISTS visual_messages (
      guild_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('control','leaderboard')),
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      PRIMARY KEY (guild_id,kind)
    );
  `);
  const get=db.prepare(`SELECT c.*, h.name home_name,h.captain_id home_captain_id,a.name away_name,a.captain_id away_captain_id
    FROM scrim_challenges c JOIN teams h ON h.id=c.home_team_id JOIN teams a ON a.id=c.away_team_id
    WHERE c.guild_id=? AND c.id=?`);
  const team=db.prepare('SELECT * FROM teams WHERE guild_id=? AND name=?');
  const requireChallenge=(guildId,id)=>{const c=get.get(guildId,id);if(!c)throw new Error('Challenge not found.');return c;};
  const updateStatus=db.prepare("UPDATE scrim_challenges SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?");
  return {
    create(guildId,homeName,awayName,format,startText,notes,userId,isAdmin) {
      return db.transaction(()=>{
        const h=team.get(guildId,homeName.trim()),a=team.get(guildId,awayName.trim());
        if(!h||!a)throw new Error('Both teams must be registered. Use /team list to check names.');
        if(h.id===a.id)throw new Error('A team cannot challenge itself.');
        if(!isAdmin && h.captain_id!==userId)throw new Error('Only the challenging team captain or an administrator can send this challenge.');
        if(!['BO3','BO5'].includes(format))throw new Error('Choose BO3 or BO5.');
        if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(startText))throw new Error('Enter date/time as YYYY-MM-DD HH:MM (Pacific).');
        const [day,clock]=startText.split(' '),[year,month,date]=day.split('-').map(Number),[hour,minute]=clock.split(':').map(Number);
        if(new Date(Date.UTC(year,month-1,date)).toISOString().slice(0,10)!==day||hour>23||minute>59)throw new Error('Invalid date or time.');
        if(new Date(startText.replace(' ','T')+':00-08:00').getTime()<Date.now()-3600000)throw new Error('Please choose a future date/time.');
        const pending=db.prepare("SELECT COUNT(*) count FROM scrim_challenges WHERE guild_id=? AND created_by=? AND status='pending'").get(guildId,userId).count;
        if(pending>=3)throw new Error('Maximum of three unanswered challenges per captain.');
        const duplicate=db.prepare("SELECT id FROM scrim_challenges WHERE guild_id=? AND home_team_id=? AND away_team_id=? AND status='pending'").get(guildId,h.id,a.id);
        if(duplicate)throw new Error(`This matchup already has an open challenge (#${duplicate.id}).`);
        const result=db.prepare("INSERT INTO scrim_challenges (guild_id,home_team_id,away_team_id,created_by,format,start_text,notes) VALUES (?,?,?,?,?,?,?)")
          .run(guildId,h.id,a.id,userId,format,startText,notes.slice(0,400));
        return requireChallenge(guildId,result.lastInsertRowid);
      })();
    },
    get:requireChallenge,
    listForCaptain(guildId,userId) {
      return db.prepare(`SELECT c.id,c.status,c.format,c.start_text,h.name home_name,a.name away_name
        FROM scrim_challenges c JOIN teams h ON c.home_team_id=h.id JOIN teams a ON c.away_team_id=a.id
        WHERE c.guild_id=? AND (h.captain_id=? OR a.captain_id=?) ORDER BY c.id DESC LIMIT 10`).all(guildId,userId,userId);
    },
    respond(guildId,id,action,userId,isAdmin) {
      return db.transaction(()=>{
        const c=requireChallenge(guildId,id);
        if(c.status!=='pending')throw new Error('This challenge has already been answered.');
        if(!isAdmin && c.away_captain_id!==userId)throw new Error('Only the challenged team captain can respond.');
        if(action==='decline') {updateStatus.run('declined',id);return requireChallenge(guildId,id);}
        if(action!=='accept')throw new Error('Unknown response.');
        const scrim=store.startScrim(guildId,c.home_name,c.away_name,userId,isAdmin);
        db.prepare("UPDATE scrim_challenges SET status='accepted',scrim_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(scrim.id,id);
        return requireChallenge(guildId,id);
      })();
    },
    cancel(guildId,id,userId,isAdmin) {
      return db.transaction(()=>{
        const c=requireChallenge(guildId,id);
        if(c.status!=='pending')throw new Error('Challenge is no longer pending.');
        if(!isAdmin && c.home_captain_id!==userId)throw new Error('Only the challenger can cancel.');
        updateStatus.run('cancelled',id);return requireChallenge(guildId,id);
      })();
    },
    putMessage(guildId,kind,channelId,messageId) {
      db.prepare(`INSERT INTO visual_messages (guild_id,kind,channel_id,message_id) VALUES (?,?,?,?)
        ON CONFLICT(guild_id,kind) DO UPDATE SET channel_id=excluded.channel_id,message_id=excluded.message_id`).run(guildId,kind,channelId,messageId);
    },
    getMessage(guildId,kind) {return db.prepare('SELECT * FROM visual_messages WHERE guild_id=? AND kind=?').get(guildId,kind);},
    activeCount(guildId){return db.prepare("SELECT COUNT(*) count FROM scrim_challenges WHERE guild_id=? AND status='pending'").get(guildId).count;}
  };
}
