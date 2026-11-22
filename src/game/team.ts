/** The player's team: name, colour and two drivers. Saved on the phone. */
export interface Team {
  name: string;
  color: string;
  drivers: [{ name: string; num: number }, { name: string; num: number }];
}

export const TEAM_COLORS = ['#ffd200', '#9b59ff', '#ff4fa3', '#ffffff', '#7fdbff', '#b6ff00', '#8b5a2b', '#1a1a1a', '#ff6f3c', '#3cb4ff'];

export const DEFAULT_TEAM: Team = {
  name: 'Basel Rockets',
  color: '#ffd200',
  drivers: [
    { name: 'Kenny Junior', num: 7 },
    { name: 'Alex Speed', num: 27 },
  ],
};

/** Problems with a team (empty = fine). Keys are translation keys. */
export function validateTeam(t: Team): ('errTeamName' | 'errDriverName' | 'errNumber' | 'errSameNumber')[] {
  const errs: ('errTeamName' | 'errDriverName' | 'errNumber' | 'errSameNumber')[] = [];
  if (!t || typeof t.name !== 'string' || !t.name.trim()) errs.push('errTeamName');
  if (!Array.isArray(t?.drivers) || t.drivers.length !== 2) return [...errs, 'errDriverName'];
  if (t.drivers.some((d) => !d.name?.trim())) errs.push('errDriverName');
  if (t.drivers.some((d) => !Number.isInteger(d.num) || d.num < 2 || d.num > 99)) errs.push('errNumber');
  if (t.drivers[0].num === t.drivers[1].num) errs.push('errSameNumber');
  return errs;
}
