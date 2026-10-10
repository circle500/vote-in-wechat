// 文件路径：cloudfunctions/vote_delete/index.js
// 功能：发起人删除投票（物理删除，事务保证主记录与投票记录一致清除）
// 规则：仅发起人；发起后 10 分钟内可撤回；已过期禁止删除
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const WITHDRAW_WINDOW = 10 * 60 * 1000; // 10 分钟撤回窗口

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

  // 2. 权限校验：仅发起人可删除
  if (vote.creatorOpenid !== OPENID) {
    return { code: 'FORBIDDEN', message: '仅发起人可删除该投票' };
  }

  // 3. 已过期投票禁止删除
  if (vote.expireAt <= now) {
    return { code: 'ENDED', message: '投票已过期，禁止删除' };
  }

  // 4. 超过 10 分钟撤回窗口禁止删除
  if (now - vote.createdAt > WITHDRAW_WINDOW) {
    return { code: 'TIMEOUT', message: '仅可在发起后10分钟内撤回' };
  }

  // 5. 事务删除：主记录 + 该投票的全部投票记录一并清除
  try {
    await db.runTransaction(async (transaction) => {
      await transaction.collection('votes').doc(voteId).remove();
      // 小规模场景记录量有限，逐条删除；记录量大时可改为分批处理
      const recs = await transaction.collection('vote_records').where({ voteId }).get();
      for (const r of recs.data) {
        await transaction.collection('vote_records').doc(r._id).remove();
      }
    });
    return { code: 'OK' };
  } catch (e) {
    console.error('vote_delete 失败', e);
    return { code: 'ERROR', message: '删除失败，请稍后重试' };
  }
};
