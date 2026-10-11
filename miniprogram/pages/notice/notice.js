// 文件路径：miniprogram/pages/notice/notice.js
// 更新公告列表页（仿微信「功能介绍」风格）
const notices = require('./data.js');

Page({
  data: {
    list: []
  },

  onLoad() {
    // 数据为本地静态文件，直接渲染
    this.setData({ list: notices });
  },

  // 点击进入公告详情
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/notice/detail?id=' + id });
  }
});
