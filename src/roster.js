/**
 * One registered team per Discord user in a guild. Existing team captains are
 * backfilled on startup without replacing existing memberships.
 */
export function createRoster(store) {
  const db=store.db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_members (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS team_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      invitee_id TEXT NOT NULL,
      inviter_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','declined','revoked')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_team_invites ON team_invites(guild_id,invitee_id,state);
  `);
  // A captain who already joined another team must be resolved by admins,
  // rather than silently replacing their current membership.
  db.prepare(`INSERT OR IGNORE INTO team_members (guild_id,user_id,team_id)
    SELECT guild_id,captain_id,id FROM teams`).run();
  const my=db.prepare(`SELECT t.*, m.joined_at FROM team_members m JOIN teams t ON t.id=m.team_id
    WHERE m.guild_id=? AND m.user_id=?`);
  const invite=db.prepare(`SELECT v.*,t.name team_name,t.captain_id FROM team_invites v JOIN teams t ON t.id=v.team_id
    WHERE v.guild_id=? AND v.id=?`);
  return {
    mine(guild,user) {return my.get(guild,user)||null;},
    registerCaptain(guild,user,teamId) {
      return db.transaction(()=>{
        const existing=my.get(guild,user);
        if(existing && existing.id!==teamId)throw new Error('You are already on a different team.');
        db.prepare('INSERT OR IGNORE INTO team_members(guild_id,user_id,team_id) VALUES (?,?,?)').run(guild,user,teamId);
      })();
    },
    invite(guild,teamId,captainId,userId) {
      return db.transaction(()=>{
        const team=db.prepare('SELECT * FROM teams WHERE id=? AND guild_id=?').get(teamId,guild);
        if(!team||team.captain_id!==captainId)throw new Error('Only the registered captain may invite members.');
        if(userId===captainId)throw new Error('You are already the captain.');
        if(my.get(guild,userId))throw new Error('That member already belongs to a team.');
        const pending=db.prepare("SELECT * FROM team_invites WHERE guild_id=? AND team_id=? AND invitee_id=? AND state='pending'").get(guild,teamId,userId);
        if(pending)return invite.get(guild,pending.id);
        const result=db.prepare('INSERT INTO team_invites(guild_id,team_id,invitee_id,inviter_id) VALUES(?,?,?,?)').run(guild,teamId,userId,captainId);
        return invite.get(guild,result.lastInsertRowid);
      })();
    },
    respond(guild,id,user,action) {
      return db.transaction(()=>{
        const row=invite.get(guild,id);
        if(!row||row.invitee_id!==user)throw new Error('This invitation is not addressed to you.');
        if(row.state!=='pending')throw new Error('Invitation already answered.');
        if(!['accepted','declined'].includes(action))throw new Error('Invalid response.');
        if(action==='accepted') {
          if(my.get(guild,user))throw new Error('Leave your current team before joining another.');
          db.prepare('INSERT INTO team_members(guild_id,user_id,team_id) VALUES (?,?,?)').run(guild,user,row.team_id);
          db.prepare("UPDATE team_invites SET state='revoked' WHERE guild_id=? AND invitee_id=? AND state='pending' AND id<>?").run(guild,user,id);
        }
        db.prepare('UPDATE team_invites SET state=? WHERE id=?').run(action,id);
        return invite.get(guild,id);
      })();
    },
    transfer(guild,fromUser,toUser) {
      return db.transaction(()=>{
        const team=my.get(guild,fromUser);
        if(!team || team.captain_id!==fromUser)throw new Error('Only the current captain can transfer captaincy.');
        const next=my.get(guild,toUser);
        if(!next||next.id!==team.id||toUser===fromUser)throw new Error('Choose another member of your team.');
        db.prepare('UPDATE teams SET captain_id=? WHERE id=? AND guild_id=?').run(toUser,team.id,guild);
        return team.name;
      })();
    },
    leave(guild,user) {
      return db.transaction(()=>{
        const team=my.get(guild,user);
        if(!team)throw new Error('You are not currently on a team.');
        if(team.captain_id===user)throw new Error('Captains cannot leave until their captaincy is transferred. Ask a league administrator to update your captain.');
        db.prepare('DELETE FROM team_members WHERE guild_id=? AND user_id=?').run(guild,user);
        return team;
      })();
    },
    members(guild,teamId) {
      return db.prepare('SELECT user_id FROM team_members WHERE guild_id=? AND team_id=? ORDER BY joined_at').all(guild,teamId);
    },
    otherTeams(guild,user) {
      const team=my.get(guild,user);
      if(!team)return [];
      return store.listTeams(guild).filter(x=>x.id!==team.id);
    }
  };
}
