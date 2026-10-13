import React, { useEffect, useState } from 'react';
import { useApp, isPhone } from '../store';
import { socialApi } from '../api';
import { HabitIcon, ICON_NAMES } from '../lib/icons';
import type { GroupMember, SharedDayState, SharedHabit, StripState } from '../lib/types';
import { todayISO } from '../lib/stats';
import { haptic } from '../lib/feedback';
import { useModalOpen } from '../lib/modal';

// ---- invite bell (toolbar) ----------------------------------------------
export function InviteBell() {
  const { invites, reactions, openGroups, cheersSeenAt } = useApp();
  const unseen = reactions.filter((r) => r.createdAt > cheersSeenAt).length;
  const count = invites.length + unseen;
  if (!count) {
    return (
      <button
        onClick={openGroups}
        className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:text-ink hover:bg-forest-850"
        aria-label="Groups" data-tip="Groups">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 20a3 3 0 0 1 3-3m8 0a3 3 0 0 1 3 3M18 11a2.5 2.5 0 0 0 0-5M6 11a2.5 2.5 0 0 1 0-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }
  return (
    <button
      onClick={openGroups}
      className="relative w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:text-ink hover:bg-forest-850"
      aria-label={`Groups, ${count} updates`} data-tip="Groups">
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 20a3 3 0 0 1 3-3m8 0a3 3 0 0 1 3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-mint text-forest-950 text-[9px] font-bold grid place-items-center">
          {count}
        </span>
      )}
    </button>
  );
}

// ---- groups modal --------------------------------------------------------
/** The popup (wider screens) or, with `inline`, the page behind the Groups tab on phones. */
function Sheet({ inline, onClose, label, wide, children }: {
  inline: boolean; onClose: () => void; label: string; wide?: boolean; children: React.ReactNode;
}) {
  if (inline) {
    return <div data-inline className="panel" role="region" aria-label={label}>{children}</div>;
  }
  return (
    <div className="backdrop grid place-items-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={label}>
      <div className={`panel w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} modal-scroll thin-scroll`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function GroupsModal({ inline = false }: { inline?: boolean }) {
  const {
    groupsOpen, closeGroups, groups, invites, reactions, view: appView,
    activeGroupId, createGroup, openGroupDashboard, joinByCode, respondInvite,
  } = useApp();
  const [view, setView] = useState<'list' | 'create' | 'join'>('list');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('sunrise');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (!groupsOpen) { setView('list'); setName(''); setCode(''); setErr(''); } }, [groupsOpen]);

  const showing = inline ? appView === 'groups' && isPhone() : groupsOpen;
  useModalOpen(showing && !inline);
  if (!showing) return null;
  if (activeGroupId) return <GroupDashboardView inline={inline} />;

  return (
    <Sheet inline={inline} onClose={closeGroups} label="Groups">
      <>
        <div className="panel-head">
          Groups
          <button onClick={closeGroups} className="normal-case font-semibold hover:text-ink" aria-label="Close">✕</button>
        </div>

        <div className="px-3 pb-3 flex flex-col gap-3">
          {/* pending invites */}
          {invites.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft px-1">Invitations</div>
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-line">
                  {inv.groupIcon
                    ? <HabitIcon name={inv.groupIcon} color="rgb(var(--mint))" size={16} />
                    : <span className="w-2.5 h-2.5 rounded-full bg-mint shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">{inv.groupName}</div>
                    <div className="text-[11px] text-ink-soft truncate">from {inv.inviterName}</div>
                  </div>
                  <button onClick={() => respondInvite(inv.id, 'accept')}
                    className="text-[11px] font-semibold bg-mint text-forest-950 rounded-lg px-2.5 py-1.5">Join</button>
                  <button onClick={() => respondInvite(inv.id, 'decline')}
                    className="text-[11px] text-ink-soft hover:text-ink border border-line rounded-lg px-2.5 py-1.5">Decline</button>
                </div>
              ))}
            </div>
          )}

          {/* reactions feed */}
          {reactions.length > 0 && (
            <div className="flex flex-col gap-1 border border-line rounded-lg p-2.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-0.5">Recent cheers</div>
              {reactions.slice(0, 4).map((r, i) => (
                <div key={i} className="text-[12px] text-ink">
                  <span className="mr-1">{r.emoji}</span>
                  <span className="font-medium">{r.fromName}</span>
                  <span className="text-ink-soft"> cheered your </span>
                  <span className="font-medium">{r.habitName}</span>
                </div>
              ))}
            </div>
          )}

          {/* my groups */}
          {view === 'list' && (
            <>
              {groups.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {groups.map((g) => (
                    <button key={g.id} onClick={() => openGroupDashboard(g.id)}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg border border-line hover:bg-forest-850/60 text-left">
                      {g.icon
                        ? <HabitIcon name={g.icon} color="rgb(var(--mint))" size={16} />
                        : <span className="w-2.5 h-2.5 rounded-full bg-mint shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate">{g.name}</div>
                        <div className="text-[11px] text-ink-soft">{g.memberCount} member{g.memberCount === 1 ? '' : 's'} · {g.role}</div>
                      </div>
                      <span className="text-ink-soft">›</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-ink-soft text-center py-4">
                  No groups yet. Create one or join with a code.
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={() => setView('create')}
                  className="flex-1 text-[12px] font-semibold bg-mint text-forest-950 rounded-lg py-2">New group</button>
                <button onClick={() => setView('join')}
                  className="flex-1 text-[12px] font-medium border border-line rounded-lg py-2 hover:bg-forest-850">Join by code</button>
              </div>
            </>
          )}

          {view === 'create' && (
            <div className="flex flex-col gap-2.5">
              <div className="text-[12px] font-semibold">New group</div>
              <input className="input" placeholder="Group name (e.g. Morning Crew)"
                value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <div>
                <div className="text-[11px] text-ink-soft mb-1.5">Icon</div>
                <div className="flex flex-wrap gap-1">
                  {ICON_NAMES.slice(0, 14).map((n) => (
                    <button key={n} onClick={() => setIcon(n)}
                      className={`w-8 h-8 grid place-items-center rounded-md border ${icon === n ? 'border-mint bg-mint/10' : 'border-line hover:bg-forest-850'}`}>
                      <HabitIcon name={n} color={icon === n ? 'rgb(var(--mint))' : 'rgb(var(--ink-soft))'} size={15} />
                    </button>
                  ))}
                </div>
              </div>
              {err && <p className="text-[11px] text-red-400">{err}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setView('list')} className="text-[12px] text-ink-soft px-3 py-1.5">Back</button>
                <button disabled={!name.trim() || busy}
                  onClick={async () => { setBusy(true); setErr(''); try { await createGroup(name.trim(), icon); } catch (e) { setErr(e instanceof Error ? e.message : 'failed'); } finally { setBusy(false); } }}
                  className="text-[12px] font-semibold bg-mint text-forest-950 rounded-lg px-3 py-1.5 disabled:opacity-40">
                  {busy ? '…' : 'Create'}
                </button>
              </div>
            </div>
          )}

          {view === 'join' && (
            <div className="flex flex-col gap-2.5">
              <div className="text-[12px] font-semibold">Join by code</div>
              <input className="input num tracking-[0.2em] uppercase" placeholder="ABCD1234" maxLength={8}
                value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus />
              {err && <p className="text-[11px] text-red-400">{err}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setView('list')} className="text-[12px] text-ink-soft px-3 py-1.5">Back</button>
                <button disabled={code.length < 4 || busy}
                  onClick={async () => { setBusy(true); setErr(''); const id = await joinByCode(code.trim()); setBusy(false); if (id) { setView('list'); openGroupDashboard(id); } else setErr('invalid code'); }}
                  className="text-[12px] font-semibold bg-mint text-forest-950 rounded-lg px-3 py-1.5 disabled:opacity-40">
                  {busy ? '…' : 'Join'}
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    </Sheet>
  );
}

// ---- group dashboard -----------------------------------------------------
function GroupDashboardView({ inline }: { inline: boolean }) {
  const {
    closeGroups, groups, activeGroupId, groupDashboard, openGroupDashboard, reactTo, loadSocial,
  } = useApp();
  const group = groups.find((g) => g.id === activeGroupId);
  const [tab, setTab] = useState<'members' | 'share' | 'manage'>('members');
  const back = () => { openGroupDashboard(''); useApp.setState({ activeGroupId: null, groupDashboard: null }); };

  return (
    <Sheet inline={inline} onClose={closeGroups} label="Group dashboard" wide>
      <>
        <div className="panel-head sticky top-0 bg-panel z-10">
          <span className="flex items-center gap-2">
            <button onClick={back} className="hover:text-ink" aria-label="Back to groups">‹</button>
            {group?.icon && <HabitIcon name={group.icon} color="rgb(var(--mint))" size={15} />}
            <span className="normal-case tracking-normal text-[13px] font-semibold">{group?.name ?? 'Group'}</span>
          </span>
          <button onClick={closeGroups} className="normal-case font-semibold hover:text-ink" aria-label="Close">✕</button>
        </div>

        {/* tabs */}
        <div className="flex gap-1 px-3 pt-2">
          {([['members', 'Progress'], ['share', 'What I share'], ['manage', 'Manage']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`text-[11px] font-medium rounded-lg px-3 py-1.5 ${tab === id ? 'bg-forest-850 text-ink' : 'text-ink-soft hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-3">
          {tab === 'members' && (
            !groupDashboard ? <div className="shimmer h-40 w-full" /> : (
              <div className="flex flex-col gap-3">
                <GroupHabitsSection
                  groupId={groupDashboard.groupId}
                  habits={groupDashboard.sharedHabits}
                  ownerId={groups.find((g) => g.id === groupDashboard.groupId)?.ownerId}
                  meId={groupDashboard.members.find((x) => x.isMe)?.userId}
                  reload={() => openGroupDashboard(groupDashboard.groupId)}
                />

                {/* milestone feed */}
                {groupDashboard.milestones.length > 0 && (
                  <div className="border border-line rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-2">Recent milestones</div>
                    <div className="flex flex-col gap-2">
                      {groupDashboard.milestones.slice(0, 6).map((ms, i) => (
                        <div key={`${ms.userId}-${ms.habitId}-${ms.milestone}`} className="flex items-center gap-2.5">
                          <span className="text-[15px]" aria-hidden>🏆</span>
                          <p className="text-[12px] flex-1 min-w-0 truncate">
                            <span className="font-semibold">{ms.name}</span>
                            <span className="text-ink-soft"> hit a </span>
                            <span className="num font-semibold text-mint">{ms.milestone}-{ms.unit === 'weeks' ? 'week' : 'day'}</span>
                            <span className="text-ink-soft"> streak — </span>
                            <span className="inline-flex items-center gap-1">
                              {ms.icon && <HabitIcon name={ms.icon} color={ms.color} size={12} />}
                              <span className="font-medium">{ms.habitName}</span>
                            </span>
                          </p>
                          <span className="num text-[10px] text-ink-soft shrink-0">{+ms.date.slice(8, 10)}/{+ms.date.slice(5, 7)}</span>
                          {ms.userId && ms.userId !== groupDashboard.members.find((x) => x.isMe)?.userId && (
                            <CheerBtn onPick={(e) => reactTo(groupDashboard.groupId, ms.userId!, ms.habitId, e)} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* leaderboard */}
                {groupDashboard.leaderboard.length > 1 && (
                  <div className="border border-line rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-2">This month</div>
                    <div className="flex flex-col gap-1.5">
                      {groupDashboard.leaderboard.map((l, i) => (
                        <div key={l.userId} className="flex items-center gap-2.5">
                          <span className="num text-[11px] text-ink-soft w-4">{i + 1}</span>
                          <span className="text-[12px] font-medium flex-1 truncate">{l.name}</span>
                          <div className="w-28 h-2 bg-forest-800 rounded-full overflow-hidden">
                            <div className="h-full bg-mint rounded-full" style={{ width: `${l.monthPct}%` }} />
                          </div>
                          <span className="num text-[11px] text-ink-soft w-9 text-right">{l.monthPct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* member cards */}
                {groupDashboard.members.map((m) => (
                  <div key={m.userId} className="border border-line rounded-lg p-3">
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="w-8 h-8 rounded-full bg-forest-800 grid place-items-center text-[13px] font-semibold shrink-0">
                        {(m.name[0] ?? '?').toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold truncate">
                          {m.name}{m.isMe && <span className="text-ink-soft font-normal"> · you</span>}
                        </div>
                        <div className="text-[11px] text-ink-soft">
                          {m.sharedCount ? `${m.todayPct ?? 0}% today · ${m.monthPct ?? 0}% this month` : 'sharing nothing yet'}
                        </div>
                      </div>
                    </div>
                    {m.habits.map((h) => (
                      <div key={h.id} className="flex items-center gap-2.5 py-1.5">
                        {h.icon
                          ? <HabitIcon name={h.icon} color={h.color} size={14} />
                          : <span className="w-2 h-2 rounded-full shrink-0" style={{ background: h.color }} />}
                        <span className="text-[12px] flex-1 truncate">{h.name}</span>
                        <WeekStrip strip={h.strip} />
                        <span className="num text-[11px] text-ink-soft w-12 text-right">
                          {h.streak > 0 ? `🔥 ${h.streak}${h.scheduleType === 'per_week' ? 'w' : 'd'}` : '–'}
                        </span>
                        {!m.isMe && (
                          <CheerBtn
                            total={h.reactions.reduce((n, r) => n + r.n, 0)}
                            onPick={(e) => reactTo(groupDashboard.groupId, m.userId, h.id, e)}
                          />
                        )}
                      </div>
                    ))}
                    {m.isMe && !m.habits.length && (
                      <button onClick={() => setTab('share')}
                        className="text-[11px] text-mint hover:underline">Choose what to share →</button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'share' && <ShareTab groupId={activeGroupId!} onSaved={() => { loadSocial(); openGroupDashboard(activeGroupId!); }} />}
          {tab === 'manage' && <ManageTab groupId={activeGroupId!} />}
        </div>
      </>
    </Sheet>
  );
}

const CHEER_EMOJIS = ['🔥', '👏', '💪', '🎉'];

function CheerBtn({ onPick, total }: { onPick: (emoji: string) => void; total?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[13px] opacity-60 hover:opacity-100"
        data-tip="Cheer" aria-label="Cheer" aria-expanded={open}>
        🔥{(total ?? 0) > 0 && <span className="num text-[10px] ml-0.5 text-ink-soft">{total}</span>}
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <span className="absolute bottom-6 right-0 z-40 panel px-1.5 py-1 flex gap-0.5 shadow-xl">
            {CHEER_EMOJIS.map((e) => (
              <button key={e} onClick={() => { onPick(e); setOpen(false); }}
                className="w-7 h-7 grid place-items-center rounded-md hover:bg-forest-850 text-[14px]"
                aria-label={`React ${e}`}>
                {e}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

function WeekStrip({ strip }: { strip: StripState[] }) {
  const color = (s: StripState) =>
    s === 'done' ? 'rgb(var(--mint))'
    : s === 'skip' ? 'rgb(var(--forest-700))'
    : s === 'miss' ? 'rgb(var(--forest-800))'
    : 'transparent';
  return (
    <span className="flex gap-0.5">
      {strip.map((s, i) => (
        <span key={i} className="w-2.5 h-2.5 rounded-[3px]" style={{
          background: color(s),
          border: s === 'off' ? '1px solid rgb(var(--line))' : 'none',
        }} />
      ))}
    </span>
  );
}

// ---- "what I share" tab --------------------------------------------------
function ShareTab({ groupId, onSaved }: { groupId: string; onSaved: () => void }) {
  const { habits } = useApp();
  const [shared, setShared] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    socialApi.getShares(groupId).then((ids) => { setShared(new Set(ids)); setLoading(false); }).catch(() => setLoading(false));
  }, [groupId]);

  const toggle = (id: string) => {
    const next = new Set(shared);
    next.has(id) ? next.delete(id) : next.add(id);
    setShared(next);
  };

  if (loading) return <div className="shimmer h-32 w-full" />;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-ink-soft">
        Pick which habits this group can see. They'll see your streak, month %, and a 7-day strip — never your notes.
      </p>
      <div className="flex flex-col gap-1">
        {habits.map((h) => (
          <button key={h.id} onClick={() => toggle(h.id)}
            className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-forest-850/60 text-left">
            <span className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${shared.has(h.id) ? 'bg-mint border-mint' : 'border-line'}`}>
              {shared.has(h.id) && (
                <svg viewBox="0 0 14 14" className="w-2.5 h-2.5"><path d="M3 7.5l2.5 2.5L11 4" fill="none" stroke="rgb(var(--forest-950))" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </span>
            {h.icon && <HabitIcon name={h.icon} color={h.color} size={14} />}
            <span className="text-[13px]">{h.name}</span>
          </button>
        ))}
        {!habits.length && <p className="text-[12px] text-ink-soft py-3 text-center">No habits to share yet.</p>}
      </div>
      <div className="flex justify-end pt-1">
        <button disabled={saving}
          onClick={async () => { setSaving(true); await socialApi.setShares(groupId, [...shared]); setSaving(false); onSaved(); }}
          className="text-[12px] font-semibold bg-mint text-forest-950 rounded-lg px-4 py-1.5 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save sharing'}
        </button>
      </div>
    </div>
  );
}

// ---- manage tab (invite, code, leave/delete) -----------------------------
function ManageTab({ groupId }: { groupId: string }) {
  const { groups, closeGroups, loadSocial } = useApp();
  const group = groups.find((g) => g.id === groupId);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { socialApi.members(groupId).then(setMembers).catch(() => {}); }, [groupId]);
  if (!group) return null;

  const link = `${location.origin}/?join=${group.inviteCode}`;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] text-ink-soft mb-1.5">Invite by email</div>
        <div className="flex gap-2">
          <input className="input flex-1" type="email" placeholder="friend@home.lab"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <button
            onClick={async () => {
              try { await socialApi.invite(groupId, email.trim()); setMsg(`Invited ${email}`); setEmail(''); }
              catch (e) { setMsg(e instanceof Error ? e.message : 'failed'); }
            }}
            disabled={!email.includes('@')}
            className="text-[12px] font-semibold bg-mint text-forest-950 rounded-lg px-3 disabled:opacity-40">Send</button>
        </div>
        {msg && <p className="text-[11px] text-ink-soft mt-1">{msg}</p>}
      </div>

      <div>
        <div className="text-[11px] text-ink-soft mb-1.5">Or share the invite code</div>
        <div className="flex items-center gap-2">
          <code className="num tracking-[0.2em] text-[15px] font-semibold bg-forest-850 rounded-lg px-3 py-2 flex-1 text-center">{group.inviteCode}</code>
          <button
            onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="text-[11px] font-medium border border-line rounded-lg px-3 py-2 hover:bg-forest-850">
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>

      <div>
        <div className="text-[11px] text-ink-soft mb-1.5">Members ({members.length})</div>
        <div className="flex flex-col gap-0.5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-[12px] py-1">
              <span className="w-6 h-6 rounded-full bg-forest-800 grid place-items-center text-[11px] font-semibold">{(m.name[0] ?? '?').toUpperCase()}</span>
              <span className="flex-1 truncate">{m.name || m.email}</span>
              <span className="text-[10px] text-ink-soft">{m.role}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-line pt-3">
        {group.role === 'owner' ? (
          <button
            onClick={async () => { if (confirm('Delete this group for everyone?')) { await socialApi.deleteGroup(groupId); await loadSocial(); closeGroups(); } }}
            className="text-[12px] text-red-400 hover:underline">Delete group</button>
        ) : (
          <button
            onClick={async () => { await socialApi.leaveGroup(groupId); await loadSocial(); closeGroups(); }}
            className="text-[12px] text-red-400 hover:underline">Leave group</button>
        )}
      </div>
    </div>
  );
}


// ---- group habits: everyone tracks the same thing -------------------------
const SHARED_STATE_COLOR: Record<SharedDayState, string> = {
  complete: 'rgb(var(--mint))',
  excused: 'rgb(var(--forest-700))',
  broken: 'rgb(var(--forest-800))',
  pending: 'transparent',
  off: 'transparent',
};

function GroupHabitsSection({ groupId, habits, ownerId, meId, reload }: {
  groupId: string;
  habits: SharedHabit[];
  ownerId?: string;
  meId?: string;
  reload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('food');
  const [busy, setBusy] = useState(false);
  const t = todayISO();

  const cycleMine = async (h: SharedHabit) => {
    // done -> skip -> clear -> done
    const next = h.myToday === 'done' ? -1 : h.myToday === 'skip' ? null : 1;
    haptic(8);
    await socialApi.setMyGroupEntry(groupId, h.id, t, next as 1 | -1 | null).catch(() => {});
    reload();
  };

  return (
    <div className="border border-line rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-2 flex items-center justify-between">
        <span>Group habits · everyone together</span>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="normal-case tracking-normal text-ink-soft hover:text-ink font-semibold">+ new</button>
        )}
      </div>

      {creating && (
        <div className="flex flex-col gap-2 mb-3 p-2.5 rounded-lg bg-forest-850/50">
          <input className="input" placeholder="e.g. No takeout this month"
            value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
          <div className="flex flex-wrap gap-1">
            {ICON_NAMES.slice(0, 12).map((n) => (
              <button key={n} onClick={() => setIcon(n)}
                className={`w-7 h-7 grid place-items-center rounded-md border ${icon === n ? 'border-mint bg-mint/10' : 'border-line hover:bg-forest-850'}`}>
                <HabitIcon name={n} color={icon === n ? 'rgb(var(--mint))' : 'rgb(var(--ink-soft))'} size={14} />
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setCreating(false); setName(''); }}
              className="text-[11px] text-ink-soft px-2 py-1">Cancel</button>
            <button disabled={!name.trim() || busy}
              onClick={async () => {
                setBusy(true);
                await socialApi.createGroupHabit(groupId, { name: name.trim(), icon }).catch(() => {});
                setBusy(false); setCreating(false); setName('');
                reload();
              }}
              className="text-[11px] font-semibold bg-mint text-forest-950 rounded-lg px-3 py-1 disabled:opacity-40">
              {busy ? '…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {!habits.length && !creating && (
        <p className="text-[12px] text-ink-soft">
          A shared streak that only grows when <span className="text-ink font-medium">everyone</span> checks in.
          Skips are excused; one miss resets it. Try "No takeout" or "Evening walk".
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {habits.map((h) => (
          <div key={h.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              {h.icon
                ? <HabitIcon name={h.icon} color={h.color} size={15} />
                : <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: h.color }} />}
              <span className="text-[13px] font-medium flex-1 truncate">{h.name}</span>
              <span className="flex gap-0.5" aria-label="last 7 days">
                {h.strip.map((st, i) => (
                  <span key={i} className="w-2.5 h-2.5 rounded-[3px]" style={{
                    background: SHARED_STATE_COLOR[st],
                    border: st === 'pending' || st === 'off' ? '1px solid rgb(var(--line))' : 'none',
                  }} />
                ))}
              </span>
              <span className="num text-[12px] font-semibold w-12 text-right"
                style={{ color: h.streak > 0 ? 'rgb(var(--mint))' : 'rgb(var(--ink-soft))' }}>
                🔥 {h.streak}
              </span>
              {(h.createdBy === meId || ownerId === meId) && (
                <button
                  onClick={async () => {
                    if (confirm(`Delete "${h.name}" for the whole group?`)) {
                      await socialApi.deleteGroupHabit(groupId, h.id).catch(() => {});
                      reload();
                    }
                  }}
                  className="text-ink-soft hover:text-red-400 text-[12px]" aria-label="Delete group habit">✕</button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap pl-6">
              {h.members.map((m) => (
                <span key={m.userId}
                  className={`text-[10.5px] px-2 py-0.5 rounded-full border ${
                    m.today === 'done' ? 'border-mint/60 bg-mint/12 text-ink'
                    : m.today === 'skip' ? 'border-line text-ink-soft'
                    : 'border-line text-ink-soft opacity-60'
                  }`}
                  data-tip={m.today === 'done' ? 'done today' : m.today === 'skip' ? 'skipped (excused)' : 'not yet'}>
                  {m.today === 'done' ? '✓ ' : m.today === 'skip' ? '» ' : '· '}{m.name}
                </span>
              ))}
              <button
                onClick={() => cycleMine(h)}
                className={`ml-auto text-[11px] font-semibold rounded-lg px-3 py-1 ${
                  h.myToday === 'done' ? 'bg-mint text-forest-950'
                  : h.myToday === 'skip' ? 'border border-line text-ink-soft'
                  : 'border border-mint/60 text-mint hover:bg-mint/10'
                }`}
                data-tip="Tap cycles: done → skip → clear">
                {h.myToday === 'done' ? '✓ Done' : h.myToday === 'skip' ? '» Skipped' : 'I did it today'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
