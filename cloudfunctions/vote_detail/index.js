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

    // 头像与问题图片 fileID 转临时访问链接
    // 免费套餐下客户端受存储权限「仅创建者可读写」限制，看不到他人文件；
    // 云函数以管理员身份调用 getTempFileURL 生成签名链接，前端直接加载即可绕过该限制
    let avatarUrl = vote.creatorAvatar || '';
    let questionImageUrl = vote.questionImage || '';
    const fileIDs = [avatarUrl, questionImageUrl].filter(id => id && id.indexOf('cloud://') === 0);
    if (fileIDs.length > 0) {
      try {
        const urlRes = await cloud.getTempFileURL({ fileList: fileIDs });
        const urlMap = {};
        (urlRes.fileList || []).forEach(f => {
          if (f.status === 0) urlMap[f.fileID] = f.tempFileURL;
        });
        if (urlMap[avatarUrl]) avatarUrl = urlMap[avatarUrl];
        if (urlMap[questionImageUrl]) questionImageUrl = urlMap[questionImageUrl];
      } catch (e) {
        console.error('临时链接生成失败', e); // 失败保留 fileID，前端有兜底处理
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
        questionImage: questionImageUrl,
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
