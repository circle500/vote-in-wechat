// 文件路径：cloudfunctions/vote_finish/index.js
// 功能：发起人提前结束投票（将 expireAt 置为当前服务端时间，后续按已过期处理）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { voteId } = event;
  if (!voteId) return { code: 'INVALID', message: '参数缺失' };
  const now = Date.now();

  // 1. 查询投票
  let vote;
  try {
    vote = (await db.collection('votes').doc(voteId).get()).data;
  } catch (e) {
    return { code: 'NOT_FOUND', message: '投票不存在或已被删除' };
  }

  // 2. 权限校验：仅发起人可提前结束
  if (vote.creatorOpenid !== OPENID) {
    return { code: 'FORBIDDEN', message: '仅发起人可提前结束' };
  }

  // 3. 已结束的投票无需重复操作
  if (vote.expireAt <= now) {
    return { code: 'ENDED', message: '投票已结束' };
  }

  // 4. 将过期时间置为当前时间，等价于立即结束
  try {
    await db.collection('votes').doc(voteId).update({
      data: { expireAt: now }
    });
    return { code: 'OK' };
  } catch (e) {
    console.error('vote_finish 失败', e);
    return { code: 'ERROR', message: '操作失败，请稍后重试' };
  }
};
