// 文件路径：cloudfunctions/vote_cast/index.js
// 功能：参与投票（云端校验链 + 唯一索引防重复 + 原子自增防并发）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { voteId, optionId } = event;
  if (!voteId || !optionId) return { code: 'INVALID', message: '参数缺失' };
  const now = Date.now();

  // 1. 查询投票是否存在
  let vote;
  try {
    vote = (await db.collection('votes').doc(voteId).get()).data;
  } catch (e) {
    return { code: 'NOT_FOUND', message: '投票不存在或已被删除' };
  }

  // 2. 过期校验：以服务端时间为准，客户端时间不可信
  if (vote.expireAt < now) return { code: 'EXPIRED', message: '投票已结束' };

  // 3. 选项合法性校验
  const idx = vote.options.findIndex(o => o.id === optionId);
  if (idx === -1) return { code: 'INVALID_OPTION', message: '选项不存在' };

  // 4. 写入投票记录：voteId + openid 唯一索引是第一道并发防线，
  //    同一用户重复提交时数据库直接报 duplicate key 错误
  try {
    await db.collection('vote_records').add({
      data: { voteId, openid: OPENID, optionIds: [optionId], createdAt: now }
    });
  } catch (e) {
    if ((e.message || '').indexOf('duplicate') > -1) {
      return { code: 'VOTED', message: '你已投过票，不能重复投票' };
    }
    console.error('vote_cast 写入记录失败', e);
    return { code: 'ERROR', message: '投票失败，请稍后重试' };
  }

  // 5. 原子自增票数：db.command.inc 在服务端原子执行，并发下不会丢票
  try {
    await db.collection('votes').doc(voteId).update({
      data: {
        totalVotes: _.inc(1),
        ['options.' + idx + '.count']: _.inc(1) // 动态定位数组下标
      }
    });
  } catch (e) {
    // 补偿机制：自增失败则删除刚插入的记录，保证「记录与票数」一致
    console.error('vote_cast 自增失败，执行补偿', e);
    await db.collection('vote_records')
      .where({ voteId, openid: OPENID })
      .remove()
      .catch(() => {});
    return { code: 'ERROR', message: '投票失败，请稍后重试' };
  }

  // 6. 返回最新结果（裁剪 openid），前端直接渲染票数与百分比
  const fresh = (await db.collection('votes').doc(voteId).get()).data;

  // 头像与问题图片转临时访问链接（与 vote_detail 保持一致）：
  // 若直接下发 cloud:// fileID，客户端受存储权限限制会加载不到他人上传的文件，
  // 表现为投票后图片/头像消失（退出重进走 vote_detail 又恢复）
  let creatorAvatar = fresh.creatorAvatar || '';
  let questionImage = fresh.questionImage || '';
  const fileIDs = [creatorAvatar, questionImage].filter(id => id && id.indexOf('cloud://') === 0);
  if (fileIDs.length > 0) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: fileIDs });
      const urlMap = {};
      (urlRes.fileList || []).forEach(f => {
        if (f.status === 0) urlMap[f.fileID] = f.tempFileURL;
      });
      if (urlMap[creatorAvatar]) creatorAvatar = urlMap[creatorAvatar];
      if (urlMap[questionImage]) questionImage = urlMap[questionImage];
    } catch (e) {
      console.error('vote_cast 临时链接生成失败', e); // 失败保留 fileID，前端有兜底
    }
  }

  return {
    code: 'OK',
    vote: {
      _id: fresh._id,
      creatorName: fresh.creatorName,
      creatorAvatar,
      question: fresh.question,
      questionImage,                                 // 必须返回，否则投票后图片会丢失
      options: fresh.options,
      totalVotes: fresh.totalVotes,
      isMultiple: fresh.isMultiple,
      createdAt: fresh.createdAt,
      expireAt: fresh.expireAt
    }
  };
};
