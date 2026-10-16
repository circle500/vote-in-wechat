// 文件路径：cloudfunctions/admin_repair/index.js
// 管理员专用：头像存量数据修复辅助云函数
// 背景：历史版本直接上传了 HEIC / Display P3 原始文件，部分设备解码发绿；
//      修复需要「云函数端下载文件」（客户端受存储权限限制无法下载他人文件），
//      重新编码由小程序端画布完成，再覆盖上传原路径。
// action: 'list'  → 返回所有使用了 cloud:// 头像的投票清单（voteId / question / fileID / cloudPath）
// action: 'fetch' → 按 fileID 下载文件，返回 base64（限制单文件 2MB）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 管理员白名单：openid 不在名单内一律拒绝（防止工具页被普通用户利用）
const ADMIN_OPENIDS = [
  'o6zAJswckuTdOS0Jmj_j9Ju0Pdos'
];

const MAX_FETCH_SIZE = 2 * 1024 * 1024; // 单次下载上限 2MB（头像场景远够）

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID || ADMIN_OPENIDS.indexOf(OPENID) === -1) {
    return { code: 'FORBIDDEN', message: '仅管理员可执行此操作' };
  }

  try {
    // ---------- 列出所有需要修复的头像 ----------
    if (event.action === 'list') {
      // 分批拉全量 votes（每批 100），只取需要的字段
      const list = [];
      let batch = 100;
      let res = await db.collection('votes')
        .field({ question: true, creatorAvatar: true })
        .limit(batch)
        .get();
      list.push(...res.data);
      // 数据量大时按 createdAt 游标继续拉（亲友规模通常一批就够）
      while (res.data.length === batch) {
        const last = res.data[res.data.length - 1];
        res = await db.collection('votes')
          .where({ createdAt: _.lt(last.createdAt) })
          .field({ question: true, creatorAvatar: true })
          .limit(batch)
          .get();
        list.push(...res.data);
      }

      // 只保留 cloud:// 开头的头像（fileID 才需要修复）
      const items = list
        .filter(v => typeof v.creatorAvatar === 'string' && v.creatorAvatar.indexOf('cloud://') === 0)
        .map(v => {
          const prefix = 'cloud://';
          const idx = v.creatorAvatar.indexOf('/', prefix.length);
          return {
            voteId: v._id,
            question: v.question || '',
            fileID: v.creatorAvatar,
            cloudPath: idx > 0 ? v.creatorAvatar.slice(idx + 1) : ''
          };
        });
      return { code: 'OK', items, total: items.length };
    }

    // ---------- 下载单个文件并返回 base64 ----------
    if (event.action === 'fetch') {
      const fileID = event.fileID;
      if (!fileID || fileID.indexOf('cloud://') !== 0) {
        return { code: 'FAIL', message: 'fileID 非法' };
      }
      const dl = await cloud.downloadFile({ fileID });
      const buf = dl.fileContent;
      if (!buf || buf.length > MAX_FETCH_SIZE) {
        return { code: 'FAIL', message: '文件过大或为空' };
      }
      return { code: 'OK', base64: buf.toString('base64'), size: buf.length };
    }

    return { code: 'FAIL', message: '未知 action' };
  } catch (e) {
    console.error('admin_repair 失败', e);
    return { code: 'ERROR', message: '操作失败：' + (e.message || '未知错误') };
  }
};
