// 文件路径：miniprogram/app.js
// 小程序入口：初始化微信云开发
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      // TODO：替换为你自己的云开发环境 ID（云开发控制台 → 设置 → 环境 ID）
      env: 'your-env-id',
      traceUser: true
    });
  },
  globalData: {}
});
