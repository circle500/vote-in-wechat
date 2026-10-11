// 文件路径：miniprogram/pages/notice/detail.js
// 更新公告详情页
const notices = require('./data.js');

Page({
  data: {
    notice: null
  },

  onLoad(options) {
    // 按 id 查找对应公告，找不到时显示兜底文案
    const notice = notices.find(n => n.id === options.id) || null;
    this.setData({ notice });
    if (notice) {
      wx.setNavigationBarTitle({ title: notice.title });
    }
  }
});
