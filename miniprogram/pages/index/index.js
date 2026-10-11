// 文件路径：miniprogram/pages/index/index.js
// 投票列表页：Tab 过滤（全部/进行中/已过期）、下拉刷新、上拉加载、空状态、加载状态
const { call, formatTime, deadlineText } = require('../../utils/util.js');

Page({
  data: {
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'active', label: '进行中' },
      { key: 'expired', label: '已过期' }
    ],
    tab: 'all',        // 当前 Tab
    list: [],          // 列表数据
    loading: true,     // 首屏加载中（显示骨架屏）
    loadingMore: false,// 上拉加载中
    hasMore: true,     // 是否还有下一页
    cursor: 0,         // 分页游标（上一页最后一条的 createdAt）
    serverNow: Date.now(), // 服务端时间，用于状态判定
    error: ''          // 首屏加载失败提示
  },

  onLoad() {
    this.loadFirst();
  },

  // 每次回到本页静默刷新第一页，保证新建/删除/投票后数据一致
  onShow() {
    if (this.data.inited) {
      this.loadFirst(true);
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadFirst(false, () => wx.stopPullDownRefresh());
  },

  // 上拉加载更多
  onReachBottom() {
    this.loadMore();
  },

  // 切换 Tab：重置游标并重新加载
  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.key;
    if (tab === this.data.tab) return;
    this.setData({ tab, list: [], cursor: 0, hasMore: true, error: '' });
    this.loadFirst();
  },

  /**
   * 加载第一页
   * @param {boolean} silent 静默刷新（不显示骨架屏）
   * @param {Function} done 完成回调
   */
  async loadFirst(silent = false, done) {
    if (!silent) this.setData({ loading: true, error: '' });
    const res = await call('vote_list', { tab: this.data.tab, cursor: 0 }, { showLoading: false });
    this.setData({ loading: false, inited: true });
    if (res.code === 'OK') {
      this.setData({
        list: this.decorate(res.list, res.serverNow),
        hasMore: res.hasMore,
        serverNow: res.serverNow,
        cursor: res.list.length ? res.list[res.list.length - 1].createdAt : 0
      });
    } else {
      this.setData({ error: res.message || '加载失败' });
    }
    done && done();
  },

  // 加载下一页（游标分页）
  async loadMore() {
    if (this.data.loadingMore || !this.data.hasMore || this.data.loading) return;
    this.setData({ loadingMore: true });
    const res = await call('vote_list', { tab: this.data.tab, cursor: this.data.cursor }, { showLoading: false });
    this.setData({ loadingMore: false });
    if (res.code === 'OK') {
      const more = this.decorate(res.list, res.serverNow);
      this.setData({
        list: this.data.list.concat(more),
        hasMore: res.hasMore,
        serverNow: res.serverNow,
        cursor: res.list.length ? res.list[res.list.length - 1].createdAt : this.data.cursor
      });
    } else {
      wx.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  },

  // 装饰列表项：计算状态与展示文案
  decorate(list, serverNow) {
    return list.map(v => {
      const active = v.expireAt >= serverNow;
      return Object.assign({}, v, {
        active,
        statusText: active ? '进行中' : '已结束',
        timeText: formatTime(v.createdAt),
        deadline: deadlineText(v.expireAt, serverNow)
      });
    });
  },

  // 加载失败后重试
  onRetry() {
    this.loadFirst();
  },

  // 跳转发起投票页
  goCreate() {
    wx.navigateTo({ url: '/pages/create/create' });
  },

  // 跳转详情页
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  // 分享小程序首页（详情页另有专属分享，直达具体投票）
  onShareAppMessage() {
    return {
      title: '快来发起和参与投票吧',
      path: '/pages/index/index'
    };
  }
});
