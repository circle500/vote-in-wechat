// 文件路径：cloudfunctions/stats_overview/index.js
// 功能：数据看板聚合统计（仅管理员可见）
// 统计口径：总览数据 + 近7天趋势（发起数/参与人次）+ 热门投票 Top5
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 管理员 openid 白名单：只有名单内的用户调用本函数才会返回数据
// 如何获取自己的 openid：云函数日志、vote_records 表记录、真机调试信息中均可见
const ADMIN_OPENIDS = [
  'o6zAJswckuTdOS0Jmj_j9Ju0Pdos' // 项目管理员
];

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();

  // 权限校验：非管理员直接拒绝，不返回任何数据
  if (ADMIN_OPENIDS.indexOf(OPENID) === -1) {
    return { code: 'FORBIDDEN', message: '仅管理员可查看数据看板' };
  }

  const now = Date.now();
  try {
    // 注：limit(1000) 为云数据库单次查询上限，本项目为亲友小规模使用，足够覆盖；
    // 若未来数据量超过 1000，需改为分批拉取或改用聚合管道
    const [votesRes, recsRes] = await Promise.all([
      db.collection('votes')
        .field({ question: true, totalVotes: true, createdAt: true, expireAt: true })
        .limit(1000)
        .get(),
      db.collection('vote_records')
        .field({ createdAt: true, openid: true })
        .limit(1000)
        .get()
    ]);
    const votes = votesRes.data;
    const recs = recsRes.data;

    // 1. 总览卡片数据
    const overview = {
      totalVotes: votes.length,                                    // 投票总数
      activeCount: votes.filter(v => v.expireAt >= now).length,    // 进行中
      expiredCount: votes.filter(v => v.expireAt < now).length,    // 已过期
      totalBallots: recs.length,                                   // 参与人次（一人投多票计多次）
      uniqueVoters: new Set(recs.map(r => r.openid)).size          // 独立参与人数（按 openid 去重）
    };

    // 2. 近 7 天趋势（含今天，按自然日统计）
    const DAY = 24 * 60 * 60 * 1000;
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const start = todayStart - i * DAY;
      const end = start + DAY;
      const d = new Date(start);
      const pad = n => (n < 10 ? '0' + n : '' + n);
      days.push({
        label: pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
        votes: votes.filter(v => v.createdAt >= start && v.createdAt < end).length,   // 当天发起的投票数
        ballots: recs.filter(r => r.createdAt >= start && r.createdAt < end).length   // 当天参与人次
      });
    }

    // 3. 热门投票 Top5（按总票数降序，不下发 openid 等敏感字段）
    const top = votes
      .slice()
      .sort((a, b) => b.totalVotes - a.totalVotes)
      .slice(0, 5)
      .map(v => ({ _id: v._id, question: v.question, totalVotes: v.totalVotes }));

    return { code: 'OK', overview, days, top, serverNow: now };
  } catch (e) {
    console.error('stats_overview 失败', e);
    return { code: 'ERROR', message: '统计数据加载失败，请稍后重试' };
  }
};
