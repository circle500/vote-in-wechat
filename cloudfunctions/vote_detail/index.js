// 文件路径：cloudfunctions/vote_detail/index.js
// 功能：投票详情 + 当前用户投票状态（字段裁剪，不下发任何 openid）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { voteId } = event;
  if (!voteId) return { code: 'INVALID', message: '参数缺失' };

  try {
    // 1. 查询投票主记录
    const res = await db.collection('votes').doc(voteId).get();
    const vote = res.data;

    // 2. 查询当前用户是否已投票（同一用户同一投票仅可投一次）
    const rec = await db.collection('vote_records')
      .where({ voteId, openid: OPENID })
      .limit(1)
      .get();
    const hasVoted = rec.data.length > 0;
    const myOptionId = hasVoted ? rec.data[0].optionIds[0] : '';

    // 头像 fileID 转临时访问链接（理由同 vote_list：绕过免费套餐的客户端存储权限限制）
    let avatarUrl = vote.creatorAvatar || '';
    if (avatarUrl.indexOf('cloud://') === 0) {
      try {
        const urlRes = await cloud.getTempFileURL({ fileList: [avatarUrl] });
        const f = (urlRes.fileList || [])[0];
        if (f && f.status === 0) avatarUrl = f.tempFileURL;
      } catch (e) {
        console.error('头像临时链接生成失败', e); // 失败保留 fileID，前端有默认头像兜底
      }
    }

    // 3. 返回前裁剪敏感字段：creatorOpenid 绝不下发，改为返回 isCreator 布尔值
    return {
      code: 'OK',
      vote: {
        _id: vote._id,
        creatorName: vote.creatorName,
        creatorAvatar: avatarUrl,
        question: vote.question,
        options: vote.options,
        totalVotes: vote.totalVotes,
        isMultiple: vote.isMultiple,
        createdAt: vote.createdAt,
        expireAt: vote.expireAt
      },
      isCreator: vote.creatorOpenid === OPENID,
      hasVoted,
      myOptionId,
      serverNow: Date.now()
    };
  } catch (e) {
    // doc().get() 查不到记录会抛异常
    console.error('vote_detail 失败', e);
    return { code: 'NOT_FOUND', message: '投票不存在或已被删除' };
  }
};
