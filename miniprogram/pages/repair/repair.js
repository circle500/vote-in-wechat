// 文件路径：miniprogram/pages/repair/repair.js
// 管理员专用：头像存量数据修复页（无公开入口，通过开发者工具编译模式进入）
// 流程：云函数下载旧头像 → base64 写临时文件 → 画布重新编码为 sRGB JPEG → 覆盖上传原路径
// 说明：覆盖上传不改变 fileID，数据库无需任何改动
const { call, normalizeImageToJpg, cloudPathFromFileID } = require('../../utils/util.js');

const TMP_FILE = `${wx.env.USER_DATA_PATH}/repair_tmp.img`; // 中转临时文件（循环复用）

Page({
  data: {
    loading: false,   // 列表加载中
    repairing: false, // 修复进行中
    loaded: false,    // 列表是否已加载
    items: [],        // 待修复列表 [{ voteId, question, fileID, cloudPath, status, message }]
    doneCount: 0,     // 已处理数
    okCount: 0,       // 成功数
    failCount: 0      // 失败数
  },

  // 拉取所有使用 cloud:// 头像的投票
  async onLoad() {
    this.setData({ loading: true });
    const res = await call('admin_repair', { action: 'list' }, { showLoading: false });
    this.setData({ loading: false });
    if (res.code !== 'OK') {
      wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      return;
    }
    const items = res.items.map(it => Object.assign({}, it, { status: 'pending', message: '' }));
    this.setData({ loaded: true, items });
    if (!items.length) {
      wx.showToast({ title: '没有需要修复的头像', icon: 'none' });
    }
  },

  // 一键修复：逐个处理（串行，避免内存与带宽压力）
  async onStartRepair() {
    if (this.data.repairing) return;
    this.setData({ repairing: true, doneCount: 0, okCount: 0, failCount: 0 });
    const items = this.data.items;
    for (let i = 0; i < items.length; i++) {
      this.updateItem(i, { status: 'doing', message: '处理中...' });
      const msg = await this.repairOne(items[i]);
      const ok = msg === '';
      this.updateItem(i, {
        status: ok ? 'ok' : 'fail',
        message: ok ? '已修复' : msg
      });
      this.setData({
        doneCount: this.data.doneCount + 1,
        okCount: this.data.okCount + (ok ? 1 : 0),
        failCount: this.data.failCount + (ok ? 0 : 1)
      });
    }
    this.setData({ repairing: false });
    wx.showToast({
      title: `完成：成功${this.data.okCount} 失败${this.data.failCount}`,
      icon: this.data.failCount ? 'none' : 'success',
      duration: 3000
    });
  },

  // 修复单个头像：下载 → 重编码 → 覆盖上传。返回空串表示成功，否则为失败原因
  async repairOne(item) {
    try {
      // 1. 云函数端下载（客户端无权下载他人文件）
      const dl = await call('admin_repair', { action: 'fetch', fileID: item.fileID }, { showLoading: false });
      if (dl.code !== 'OK') return '下载失败：' + (dl.message || '');

      // 2. base64 写入本地临时文件，供画布解码
      const fs = wx.getFileSystemManager();
      fs.writeFileSync(TMP_FILE, dl.base64, 'base64');

      // 3. 画布重新编码为标准 sRGB JPEG（最长边 400px）
      const normalized = await normalizeImageToJpg(this, '#repairCanvas', TMP_FILE, 400);
      if (!normalized.ok) return '图片解码失败（设备不支持该格式）';

      // 4. 覆盖上传原路径（fileID 不变，数据库无需更新）
      const cloudPath = item.cloudPath || cloudPathFromFileID(item.fileID);
      if (!cloudPath) return 'cloudPath 解析失败';
      await wx.cloud.uploadFile({ cloudPath, filePath: normalized.path });
      return '';
    } catch (e) {
      console.error('修复单个头像失败', item.fileID, e);
      return '处理异常：' + (e.errMsg || e.message || '未知错误');
    }
  },

  // 更新单条状态
  updateItem(idx, patch) {
    this.setData({ [`items[${idx}].status`]: patch.status, [`items[${idx}].message`]: patch.message });
  },

  // 预览指定头像当前效果（用云存储临时链接需云函数，此处直接复用修复后的 fileID 由 image 组件加载 cloud:// 仅本机有效）
  // 简化：不在本页提供预览，修复完去列表页查看即可
});
