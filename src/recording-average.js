import { averageWindow } from './solve-statistics.js';
export const AVERAGE_FORMAT = 'fto-recording-average-v1';
export const isRecordingID = (id) => typeof id === 'string' && /^r-[a-f0-9]{64}$/.test(id);
const date = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function averageValue(members) {
  const value = averageWindow(members, members.length)?.value;
  return Number.isFinite(value) ? value : null;
}
export function validateAverage(group) {
  if (
    !group ||
    !/^a-[a-f0-9]{64}$/.test(group.id) ||
    ![2, 3, 4].includes(group.size) ||
    ![5, 12].includes(group.count) ||
    !Array.isArray(group.members) ||
    group.members.length !== group.count ||
    !date(group.completedAt) ||
    !date(group.savedAt)
  )
    throw Error('Invalid saved average');
  for (const member of group.members) {
    if (
      !member ||
      !Number.isFinite(member.ms) ||
      member.ms < 0 ||
      typeof member.dnf !== 'boolean' ||
      !(isRecordingID(member.id) || (member.id === null && member.dnf)) ||
      (member.at !== null && !date(member.at)) ||
      typeof member.scramble !== 'string' ||
      member.scramble.length > 20000 ||
      typeof member.comment !== 'string' ||
      member.comment.length > 2000
    )
      throw Error('Invalid average member');
  }
  if (group.averageMs !== averageValue(group.members))
    throw Error('Average does not match its solve times');
  return group;
}
export async function averageID({ size, count, members }) {
  const text = JSON.stringify({
    size,
    count,
    members: members.map(({ id, ms, dnf, at }) => ({ id, ms, dnf, at })),
  });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return 'a-' + [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
export async function makeAverage(size, members) {
  const now = new Date().toISOString(),
    group = {
      size,
      count: members.length,
      members,
      averageMs: averageValue(members),
      completedAt: members.at(-1)?.at ?? now,
      savedAt: now,
    };
  group.id = await averageID(group);
  return validateAverage(group);
}
