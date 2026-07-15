export interface WaveDef {
  wave: number
  count: number
  hp: number
  speed: number
  interval: number
  boss?: boolean
  bossSkill?: string
}

export const WAVES: WaveDef[] = [
  { wave: 1, count: 6, hp: 40, speed: 45, interval: 1.1 },
  { wave: 2, count: 8, hp: 55, speed: 48, interval: 1.0 },
  { wave: 3, count: 10, hp: 70, speed: 52, interval: 0.95 },
  { wave: 4, count: 12, hp: 90, speed: 55, interval: 0.9 },
  { wave: 5, count: 14, hp: 115, speed: 58, interval: 0.85 },
  {
    wave: 6,
    count: 10,
    hp: 160,
    speed: 50,
    interval: 0.9,
    boss: true,
    bossSkill: '查重：短暂停火',
  },
  { wave: 7, count: 16, hp: 150, speed: 60, interval: 0.8 },
  { wave: 8, count: 18, hp: 180, speed: 62, interval: 0.75 },
  {
    wave: 9,
    count: 12,
    hp: 240,
    speed: 55,
    interval: 0.85,
    boss: true,
    bossSkill: '盲审：全场减速攻击',
  },
  {
    wave: 10,
    count: 8,
    hp: 400,
    speed: 48,
    interval: 1.0,
    boss: true,
    bossSkill: '学院催稿：冲刺',
  },
]
