// 文件路径：cloudfunctions/vote_list/index.js
// 功能：投票列表分页查询（全部/进行中/已过期，按发起时间倒序，游标分页）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PAGE_SIZE = 20; // 每页条数

exports.main = async (event) => {
  const { tab = 'all', cursor = 0 } = event; // cursor 为上一页最后一条的 createdAt
  const now = Date.now();

  try {
    // 组装查询条件
    const condition = {};
    if (tab === 'active') {
      condition.expireAt = _.gte(now); // 进行中：expireAt >= 当前时间
    } else if (tab === 'expired') {
      condition.expireAt = _.lt(now);  // 已过期：expireAt < 当前时间
    }
    if (cursor) {
      condition.createdAt = _.lt(cursor); // 游标分页：取比上一页最后一条更早的数据
    }

    // 多取 1 条用于判断是否还有下一页；
    // field 裁剪：creatorOpenid 防泄露，questionImage 列表页不展示故不返回（减少流量）
    const res = await db.collection('votes')
      .where(condition)
      .field({ creatorOpenid: false, questionImage: false })
      .orderBy('createdAt', 'desc')
      .limit(PAGE_SIZE + 1)
      .get();

    const hasMore = res.data.length > PAGE_SIZE;
    const list = res.data.slice(0, PAGE_SIZE);

    // 头像 fileID 转临时访问链接：
    // 免费套餐下客户端受存储权限「仅创建者可读写」限制，看不到他人头像；
    // 云函数以管理员身份调用 getTempFileURL 生成签名链接，前端直接加载即可绕过该限制
    const fileIDs = list
      .map(v => v.creatorAvatar)
      .filter(id => id && id.indexOf('cloud://') === 0);
    if (fileIDs.length > 0) {
      try {
        const urlRes = await cloud.getTempFileURL({ fileList: fileIDs.slice(0, 50) });
        const urlMap = {};
        (urlRes.fileList || []).forEach(f => {
          if (f.status === 0) urlMap[f.fileID] = f.tempFileURL;
        });
        list.forEach(v => {
          if (urlMap[v.creatorAvatar]) v.creatorAvatar = urlMap[v.creatorAvatar];
        });
      } catch (e) {
        // 转换失败保留原 fileID，前端 binderror 会降级为默认头像
        console.error('头像临时链接生成失败', e);
      }
    }

    return {
      code: 'OK',
      list,
      hasMore,
      serverNow: now // 返回服务端时间，前端据此判定进行中/已过期，不受本地时钟影响
    };
  } catch (e) {
    console.error('vote_list 失败', e);
    return { code: 'ERROR', message: '加载失败，请稍后重试' };
  }
};
