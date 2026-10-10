// 文件路径：cloudfunctions/vote_create/index.js
// 功能：发起投票（服务端校验 + 写入 votes 集合）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 校验常量
const QUESTION_MAX = 50;      // 问题最大长度
const OPTION_MAX_LEN = 30;    // 单个选项最大长度
const OPTION_MIN = 2;         // 最少选项数
const OPTION_MAX = 10;        // 最多选项数
const MIN_DURATION = 60 * 1000; // 过期时间至少晚于当前 1 分钟

exports.main = async (event) => {
  // 静默登录：从云函数上下文直接获取 openid，无需前端传参
  const { OPENID } = cloud.getWXContext();
  const { question, options, expireAt, creatorName, creatorAvatar } = event;
  const now = Date.now();

  try {
    // 1. 校验问题：必填，不超过 50 字
    const q = (question || '').trim();
    if (!q) return { code: 'INVALID_QUESTION', message: '请输入投票问题' };
    if (q.length > QUESTION_MAX) return { code: 'INVALID_QUESTION', message: '问题不能超过50字' };

    // 2. 校验选项：2-10 个，去空白、去重、单个不超过 30 字
    if (!Array.isArray(options)) return { code: 'INVALID_OPTIONS', message: '选项格式错误' };
    const opts = options.map(t => (t || '').trim()).filter(t => t.length > 0);
    if (opts.length < OPTION_MIN) return { code: 'INVALID_OPTIONS', message: '至少需要2个选项' };
    if (opts.length > OPTION_MAX) return { code: 'INVALID_OPTIONS', message: '最多支持10个选项' };
    if (opts.some(t => t.length > OPTION_MAX_LEN)) return { code: 'INVALID_OPTIONS', message: '单个选项不能超过30字' };
    if (new Set(opts).size !== opts.length) return { code: 'INVALID_OPTIONS', message: '选项内容不能重复' };

    // 3. 校验过期时间：必须是晚于当前时间至少 1 分钟的时间戳
    if (typeof expireAt !== 'number' || isNaN(expireAt)) {
      return { code: 'INVALID_EXPIRE', message: '请选择过期时间' };
    }
    if (expireAt <= now + MIN_DURATION) {
      return { code: 'INVALID_EXPIRE', message: '过期时间必须晚于当前时间' };
    }

    // 4. 组装文档：昵称头像未授权时显示「微信用户」+ 空头像
    const name = (creatorName || '').trim().slice(0, 20) || '微信用户';
    const avatar = typeof creatorAvatar === 'string' ? creatorAvatar : '';
    const doc = {
      creatorOpenid: OPENID,                 // 发起人 openid，前端不下发
      creatorName: name,
      creatorAvatar: avatar,
      question: q,
      options: opts.map((text, i) => ({ id: 'opt_' + (i + 1), text, count: 0 })),
      totalVotes: 0,
      isMultiple: false,                     // 当前仅支持单选，字段预留
      createdAt: now,                        // 使用服务端时间，防止客户端篡改
      expireAt
    };

    const res = await db.collection('votes').add({ data: doc });
    return { code: 'OK', voteId: res._id };
  } catch (e) {
    console.error('vote_create 失败', e);
    return { code: 'ERROR', message: '发起失败，请稍后重试' };
  }
};
