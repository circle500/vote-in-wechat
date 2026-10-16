// 文件路径：miniprogram/utils/util.js
// 公共工具函数：云函数调用封装、时间格式化、截止文案

/**
 * 云函数调用封装：统一异常处理与 loading
 * @param {string} name 云函数名
 * @param {object} data 入参
 * @param {object} options { showLoading: 是否显示加载提示 }
 * @returns {Promise<object>} 云函数返回的 result（约定含 code 字段）
 */
function call(name, data = {}, options = {}) {
  const { showLoading = true } = options;
  if (showLoading) wx.showLoading({ title: '加载中...', mask: true });
  return wx.cloud.callFunction({ name, data })
    .then(res => {
      if (showLoading) wx.hideLoading();
      return res.result || { code: 'ERROR', message: '返回数据异常' };
    })
    .catch(err => {
      if (showLoading) wx.hideLoading();
      console.error(`云函数 ${name} 调用失败`, err);
      return { code: 'ERROR', message: '网络异常，请稍后重试' };
    });
}

/**
 * 时间戳格式化为 'YYYY-MM-DD HH:mm'
 * @param {number} ts 毫秒时间戳
 */
function formatTime(ts) {
  const d = new Date(ts);
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 截止时间展示文案
 * @param {number} expireAt 过期时间戳
 * @param {number} now 当前时间（建议传服务端时间）
 */
function deadlineText(expireAt, now) {
  const diff = expireAt - now;
  if (diff <= 0) return '已于 ' + formatTime(expireAt) + ' 结束';
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff >= day) return `剩余 ${Math.floor(diff / day)} 天 ${Math.floor((diff % day) / hour)} 小时`;
  if (diff >= hour) return `剩余 ${Math.floor(diff / hour)} 小时 ${Math.floor((diff % hour) / minute)} 分钟`;
  return `剩余 ${Math.max(1, Math.floor(diff / minute))} 分钟`;
}

/**
 * 计算百分比（0-100 整数）
 * @param {number} count 票数
 * @param {number} total 总票数
 */
function percent(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

/**
 * 图片色彩归一化：解码原图后经画布重新编码为标准 sRGB JPEG
 * 解决：iOS 相册的 HEIC / Display P3 广色域图片直接上传后，部分设备
 * 按 sRGB 解码时色彩空间不匹配导致整体偏色（典型表现为发绿）。
 * @param {Page} page 页面实例（用于 createSelectorQuery 查找画布）
 * @param {string} canvasSelector 画布选择器，如 '#normalizeCanvas'（type="2d"，须存在于页面且不可 display:none）
 * @param {string} url 原图路径（本地临时路径或 USER_DATA_PATH 文件）
 * @param {number} maxSize 最大边长（超出按比例缩小）
 * @returns {Promise<{path: string, ext: string, ok: boolean}>} ok=false 表示已降级为原图
 */
function normalizeImageToJpg(page, canvasSelector, url, maxSize) {
  return new Promise((resolve) => {
    const rawExt = ((url.split('.').pop() || 'jpg').split('?')[0] || 'jpg').toLowerCase();
    const fallback = () => resolve({ path: url, ext: rawExt, ok: false });
    try {
      wx.createSelectorQuery().in(page)
        .select(canvasSelector)
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res && res[0] && res[0].node;
          if (!canvas) return fallback();
          const ctx = canvas.getContext('2d');
          const img = canvas.createImage();
          img.onload = () => {
            try {
              const sw = img.width || 1;
              const sh = img.height || 1;
              const scale = Math.min(1, maxSize / Math.max(sw, sh));
              const w = Math.max(1, Math.round(sw * scale));
              const h = Math.max(1, Math.round(sh * scale));
              // 重新赋值宽高会清空画布，必须在 drawImage 之前设置
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(img, 0, 0, w, h);
              wx.canvasToTempFilePath({
                canvas,
                fileType: 'jpg',
                quality: 0.92,
                success: (r) => resolve({ path: r.tempFilePath, ext: 'jpg', ok: true }),
                fail: fallback
              });
            } catch (err) {
              console.warn('图片归一化失败，使用原图', err);
              fallback();
            }
          };
          img.onerror = () => fallback();
          img.src = url;
        });
    } catch (e) {
      console.warn('画布初始化失败，使用原图', e);
      fallback();
    }
  });
}

/**
 * 从 cloud:// fileID 中提取云存储路径（用于覆盖上传）
 * @param {string} fileID 如 cloud://env.bucket/avatars/1.jpg
 * @returns {string} avatars/1.jpg
 */
function cloudPathFromFileID(fileID) {
  const prefix = 'cloud://';
  const idx = fileID.indexOf('/', prefix.length);
  return idx > 0 ? fileID.slice(idx + 1) : '';
}

module.exports = {
  call,
  formatTime,
  deadlineText,
  percent,
  normalizeImageToJpg,
  cloudPathFromFileID
};
