import Database from 'better-sqlite3';
import { calculateStandings } from './scoring.js';

export function openDatabase(file, opts = {}) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL, name TEXT NOT NULL COLLATE NOCASE,
      captain_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id,name)
    );
    CREATE TABLE IF NOT EXISTS scrims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      home_team_id INTEGER NOT NULL REFERENCES teams(id),
      away_team_id INTEGER NOT NULL REFERENCES teams(id),
      created_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending','confirmed','disputed','cancelled')),
      winner_team_id INTEGER REFERENCES teams(id),
      evidence_url TEXT,
      reported_by TEXT, confirmed_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      CHECK(home_team_id <> away_team_id)
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      delivered_at TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_type,entity_id)
    );
  `);
  const winPoints = opts.winPoints ?? 3;
  const lossPoints = opts.lossPoints ?? 0;
  const teamByName = db.prepare('SELECT * FROM teams WHERE guild_id=? AND name=?');
  const teamById = db.prepare('SELECT * FROM teams WHERE guild_id=? AND id=?');
  const getScrim = db.prepare(`SELECT s.*, h.name home_name, a.name away_name FROM scrims s
    JOIN teams h ON h.id=s.home_team_id JOIN teams a ON a.id=s.away_team_id
    WHERE s.guild_id=? AND s.id=?`);
  const outboxEvent = db.prepare('INSERT OR IGNORE INTO outbox (event_type, entity_id, payload) VALUES (?,?,?)');
  const event = (type, match) => outboxEvent.run(type, match.id, JSON.stringify({
    event_id:`u18.scrim.${type}.${match.id}`, event_type:`scrim.${type}`, version:1,
    scrim:{ id:match.id, guild_id:match.guild_id, home_team:{id:match.home_team_id,name:match.home_name},
      away_team:{id:match.away_team_id,name:match.away_name}, winner_team_id:match.winner_team_id,
      status:match.status, evidence_url:match.evidence_url, created_at:match.created_at,
      finished_at:match.finished_at }
  }));
  const requireTeam = (guildId, name) => {
    const t=teamByName.get(guildId,name);
    if (!t) throw new Error(`Team "${name}" is not registered.`);
    return t;
  };
  const canManage = (team, userId, isAdmin) => isAdmin || team.captain_id === userId;
  const transaction = fn => db.transaction(fn)();
  return {
    db,
    registerTeam(guildId,name,captainId) {
      const clean=name.trim();
      if (clean.length < 2 || clean.length > 60) throw new Error('Team names must be 2–60 characters.');
      const result=db.prepare('INSERT INTO teams (guild_id,name,captain_id) VALUES (?,?,?)').run(guildId,clean,captainId);
      return teamById.get(guildId,result.lastInsertRowid);
    },
    listTeams(guildId) {return db.prepare('SELECT * FROM teams WHERE guild_id=? ORDER BY name').all(guildId);},
    startScrim(guildId,homeName,awayName,userId,isAdmin) {return transaction(()=>{
      const home=requireTeam(guildId,homeName), away=requireTeam(guildId,awayName);
      if (home.id === away.id) throw new Error('A team cannot scrim itself.');
      if (!canManage(home,userId,isAdmin) && !canManage(away,userId,isAdmin)) throw new Error('Only a participating captain or league admin can start a scrim.');
      const existing=db.prepare(`SELECT id FROM scrims WHERE guild_id=? AND status IN ('active','pending','disputed')
        AND (home_team_id IN (?,?) OR away_team_id IN (?,?)) LIMIT 1`).get(guildId,home.id,away.id,home.id,away.id);
      if (existing) throw new Error(`A participating team has an unresolved scrim (#${existing.id}).`);
      const inserted=db.prepare('INSERT INTO scrims (guild_id,home_team_id,away_team_id,created_by) VALUES (?,?,?,?)').run(guildId,home.id,away.id,userId);
      const match=getScrim.get(guildId,inserted.lastInsertRowid); event('created',match); return match;
    });},
    getScrim(guildId,id) {return getScrim.get(guildId,id);},
    report(guildId,id,winnerId,evidenceUrl,userId,isAdmin) {return transaction(()=>{
      const s=getScrim.get(guildId,id); if(!s) throw new Error('Scrim not found.');
      if(s.status !== 'active') throw new Error('Only active scrims can be reported.');
      if(![s.home_team_id,s.away_team_id].includes(winnerId)) throw new Error('Winner must be a participating team.');
      const reporter=teamById.get(guildId,s.home_team_id).captain_id===userId || teamById.get(guildId,s.away_team_id).captain_id===userId;
      if (!reporter && !isAdmin) throw new Error('Only a participating captain or admin can report.');
      if (!/^https:\/\//i.test(evidenceUrl)) throw new Error('Evidence must have a secure HTTPS URL.');
      db.prepare(`UPDATE scrims SET status='pending',winner_team_id=?,evidence_url=?,reported_by=? WHERE id=?`).run(winnerId,evidenceUrl,userId,id);
      const updated=getScrim.get(guildId,id); event('reported',updated); return updated;
    });},
    confirm(guildId,id,userId,isAdmin) {return transaction(()=>{
      const s=getScrim.get(guildId,id); if(!s) throw new Error('Scrim not found.');
      if(s.status !== 'pending') throw new Error('This result is not awaiting confirmation.');
      const home=teamById.get(guildId,s.home_team_id), away=teamById.get(guildId,s.away_team_id);
      const otherCaptain = userId === home.captain_id || userId === away.captain_id;
      if(!isAdmin && (!otherCaptain || userId === s.reported_by)) throw new Error('A different participating captain must confirm the result.');
      db.prepare(`UPDATE scrims SET status='confirmed',confirmed_by=?,finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(userId,id);
      const updated=getScrim.get(guildId,id); event('confirmed',updated); return updated;
    });},
    dispute(guildId,id,userId,isAdmin) {return transaction(()=>{
      const s=getScrim.get(guildId,id); if(!s) throw new Error('Scrim not found.');
      if(s.status !== 'pending') throw new Error('Only pending results can be disputed.');
      const home=teamById.get(guildId,s.home_team_id), away=teamById.get(guildId,s.away_team_id);
      if(!isAdmin && userId!==home.captain_id && userId!==away.captain_id) throw new Error('Only participating captains or admins can dispute.');
      db.prepare("UPDATE scrims SET status='disputed' WHERE id=?").run(id);
      const updated=getScrim.get(guildId,id); event('disputed',updated); return updated;
    });},
    resolve(guildId,id,winnerId,userId,isAdmin) {return transaction(()=>{
      if(!isAdmin) throw new Error('Only league admins may resolve disputes.');
      const s=getScrim.get(guildId,id); if(!s || s.status!=='disputed') throw new Error('Scrim is not disputed.');
      if(![s.home_team_id,s.away_team_id].includes(winnerId)) throw new Error('Invalid winner.');
      db.prepare("UPDATE scrims SET status='confirmed',winner_team_id=?,confirmed_by=?,finished_at=CURRENT_TIMESTAMP WHERE id=?").run(winnerId,userId,id);
      const updated=getScrim.get(guildId,id); event('confirmed',updated); return updated;
    });},
    cancel(guildId,id,userId,isAdmin) {return transaction(()=>{
      const s=getScrim.get(guildId,id); if(!s) throw new Error('Scrim not found.');
      if(!['active','pending','disputed'].includes(s.status)) throw new Error('Scrim cannot be cancelled.');
      if(!isAdmin && s.created_by!==userId) throw new Error('Only creator or league admin may cancel.');
      db.prepare("UPDATE scrims SET status='cancelled',finished_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
      const updated=getScrim.get(guildId,id); event('cancelled',updated); return updated;
    });},
    standings(guildId){
      const teams=this.listTeams(guildId);
      const matches=db.prepare("SELECT * FROM scrims WHERE guild_id=? AND status='confirmed'").all(guildId);
      return calculateStandings(teams,matches,winPoints,lossPoints);
    }
  };
}
