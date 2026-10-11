// 文件路径：miniprogram/pages/stats/stats.js
// 数据看板页（管理员专属）：总览卡片、近7天趋势柱状图、热门投票 Top5
const { call } = require('../../utils/util.js');

Page({
  data: {
    loading: true,    // 首屏加载中
    error: '',        // 加载失败提示
    forbidden: false, // 非管理员
    overview: null,   // 总览数据
    days: [],         // 近7天趋势（已带高度百分比）
    top: [],          // 热门投票 Top5
    maxBallots: 0     // Top 榜单最大票数（用于条形宽度）
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load(() => wx.stopPullDownRefresh());
  },

  async load(done) {
    this.setData({ loading: true, error: '', forbidden: false });
    const res = await call('stats_overview', {}, { showLoading: false });
    this.setData({ loading: false });

    if (res.code === 'FORBIDDEN') {
      this.setData({ forbidden: true });
    } else if (res.code !== 'OK') {
      this.setData({ error: res.message || '加载失败' });
    } else {
      // 计算柱状图高度百分比（以 7 天中最大值为 100%，无数据时给最小高度保证可见）
      const max = Math.max(1, ...res.days.map(d => Math.max(d.votes, d.ballots)));
      const days = res.days.map(d => Object.assign({}, d, {
        votesH: Math.max(2, Math.round((d.votes / max) * 100)),
        ballotsH: Math.max(2, Math.round((d.ballots / max) * 100))
      }));
      this.setData({
        overview: res.overview,
        days,
        top: res.top,
        maxBallots: res.top.length ? Math.max(1, res.top[0].totalVotes) : 1
      });
    }
    done && done();
  },

  onRetry() {
    this.load();
  },

  // 点击 Top 榜投票跳转详情页
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  }
});
