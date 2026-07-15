export interface GeneralDef {
  id: string
  name: string
  chars: [string, string]
  cd: number
  desc: string
  weight: number
}

/** 高校拼字武将：相邻且按序放置两字激活 */
export const GENERALS: GeneralDef[] = [
  {
    id: 'tsinghua',
    name: '清华',
    chars: ['清', '华'],
    cd: 20,
    desc: '水木清华：周围单位攻速+30%（8秒）',
    weight: 28,
  },
  {
    id: 'pku',
    name: '北大',
    chars: ['北', '大'],
    cd: 18,
    desc: '未名湖畔：自身伤害与攻速双加（6秒）',
    weight: 26,
  },
  {
    id: 'fudan',
    name: '复旦',
    chars: ['复', '旦'],
    cd: 25,
    desc: '日月光华：全屏减速并造成伤害',
    weight: 18,
  },
  {
    id: 'sjtu',
    name: '交大',
    chars: ['交', '大'],
    cd: 22,
    desc: '思源致远：斩杀血量最低敌人',
    weight: 16,
  },
  {
    id: 'zju',
    name: '浙大',
    chars: ['浙', '大'],
    cd: 24,
    desc: '求是创新：前排眩晕',
    weight: 12,
  },
  {
    id: 'nankai',
    name: '南开',
    chars: ['南', '开'],
    cd: 35,
    desc: '允公允能：全场高额伤害',
    weight: 8,
  },
]

export const ALL_GENERAL_CHARS = Array.from(
  new Set(GENERALS.flatMap((g) => g.chars)),
)
