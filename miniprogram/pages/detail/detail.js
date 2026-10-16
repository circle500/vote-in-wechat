// 文件路径：miniprogram/pages/detail/detail.js
// 投票详情页：进行中可投票（点击选项二次确认）、已过期仅展示结果、
// 投票后展示票数/百分比/总票数、发起人可提前结束/10分钟内删除、分享直达
const { call, formatTime, deadlineText } = require('../../utils/util.js');

const WITHDRAW_WINDOW = 10 * 60 * 1000; // 10 分钟撤回窗口（与服务端一致）

Page({
  data: {
    id: '',
    loading: true,    // 首屏加载中
    error: '',        // 加载失败/投票不存在
    vote: null,       // 投票数据（options 已带 percent 字段）
    isCreator: false, // 是否发起人
    hasVoted: false,  // 当前用户是否已投
    myOptionId: '',   // 当前用户投的选项
    active: false,    // 是否进行中
    canDelete: false, // 是否可删除（10分钟内且未过期）
    canFinish: false, // 是否可提前结束
    deadline: '',     // 截止文案
    voting: false     // 投票提交中（防重复点击）
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.load();
  },

  // 加载详情
  async load() {
    this.setData({ loading: true, error: '' });
    const res = await call('vote_detail', { voteId: this.data.id }, { showLoading: false });
    this.setData({ loading: false });
    if (res.code !== 'OK') {
      this.setData({ error: res.message || '加载失败' });
      return;
    }
    this.renderVote(res);
  },

  // 渲染投票数据：计算进行中状态、百分比、操作权限
  renderVote(res) {
    const { vote, serverNow, isCreator, hasVoted, myOptionId } = res;
    const prev = this.data.vote;
    const active = vote.expireAt >= serverNow; // 进行中：expireAt >= 当前时间
    const total = vote.totalVotes || 0;
    const options = vote.options.map(o => Object.assign({}, o, {
      // 百分比：总票数为 0 时显示 0%
      percent: total > 0 ? Math.round((o.count / total) * 100) : 0
    }));
    this.setData({
      vote: Object.assign({}, vote, {
        options,
        createdAtText: formatTime(vote.createdAt),
        // 兜底：新数据若未带回图片/头像链接（云函数字段遗漏或临时链接生成失败），
        // 沿用已有的可用链接，避免刷新后图片突然消失
        questionImage: vote.questionImage || (prev && prev.questionImage) || '',
        creatorAvatar: vote.creatorAvatar || (prev && prev.creatorAvatar) || ''
      }),
      isCreator,
      hasVoted,
      myOptionId,
      active,
      // 删除权限：发起人 + 进行中 + 发起后10分钟内
      canDelete: isCreator && active && (serverNow - vote.createdAt <= WITHDRAW_WINDOW),
      // 提前结束权限：发起人 + 进行中
      canFinish: isCreator && active,
      deadline: deadlineText(vote.expireAt, serverNow)
    });
  },

  // 点击问题配图查看大图
  onPreviewQuestionImage() {
    const url = this.data.vote && this.data.vote.questionImage;
    if (!url) return;
    wx.previewImage({ urls: [url] });
  },

  // 问题图片加载失败（如云存储文件已被清理）：隐藏图片区域
  onQuestionImageError(e) {
    console.warn('问题图片加载失败', e.detail);
    this.setData({ 'vote.questionImage': '' });
  },

  // 点击选项：仅进行中且未投票时可操作，二次确认防止误触
  onTapOption(e) {
    if (!this.data.active || this.data.hasVoted || this.data.voting) return;
    const optionId = e.currentTarget.dataset.id;
    const option = this.data.vote.options.find(o => o.id === optionId);
    wx.showModal({
      title: '确认投票',
      content: `确定投给「${option.text}」吗？投票后不可修改`,
      confirmText: '确定投票',
      confirmColor: '#07c160',
      success: (r) => {
        if (r.confirm) this.doVote(optionId);
      }
    });
  },

  // 执行投票
  async doVote(optionId) {
    this.setData({ voting: true });
    wx.showLoading({ title: '投票中...', mask: true });
    const res = await call('vote_cast', { voteId: this.data.id, optionId }, { showLoading: false });
    wx.hideLoading();
    this.setData({ voting: false });

    if (res.code === 'OK') {
      wx.showToast({ title: '投票成功', icon: 'success' });
      // 用服务端返回的最新结果直接渲染，无需再次请求
      this.renderVote({
        vote: res.vote,
        serverNow: Date.now(),
        isCreator: this.data.isCreator,
        hasVoted: true,
        myOptionId: optionId
      });
    } else if (res.code === 'VOTED') {
      // 已被唯一索引拦截：刷新详情同步真实状态
      wx.showToast({ title: res.message, icon: 'none' });
      this.load();
    } else if (res.code === 'EXPIRED') {
      wx.showToast({ title: res.message, icon: 'none' });
      this.load();
    } else {
      wx.showToast({ title: res.message || '投票失败', icon: 'none' });
    }
  },

  // 发起人提前结束
  onFinish() {
    wx.showModal({
      title: '提前结束',
      content: '结束后所有人将无法继续投票，确定提前结束吗？',
      confirmText: '提前结束',
      confirmColor: '#fa5151',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await call('vote_finish', { voteId: this.data.id });
        if (res.code === 'OK') {
          wx.showToast({ title: '已结束', icon: 'success' });
          this.load();
        } else {
          wx.showToast({ title: res.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  // 发起人删除（10分钟内可撤回）
  onDelete() {
    wx.showModal({
      title: '删除投票',
      content: '删除后不可恢复，所有投票记录将一并清除，确定删除吗？',
      confirmText: '删除',
      confirmColor: '#fa5151',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await call('vote_delete', { voteId: this.data.id });
        if (res.code === 'OK') {
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
        } else {
          wx.showToast({ title: res.message || '删除失败', icon: 'none' });
          this.load(); // 同步最新状态（如已超时/已过期）
        }
      }
    });
  },

  // 加载失败重试
  onRetry() {
    this.load();
  },

  // 头像加载失败（如云存储文件已删除）时降级为默认头像
  onAvatarError() {
    this.setData({ 'vote.creatorAvatar': '' });
  },

  // 分享卡片直达详情页
  onShareAppMessage() {
    const q = this.data.vote ? this.data.vote.question : '快来参与投票';
    return {
      title: q,
      path: '/pages/detail/detail?id=' + this.data.id
    };
  }
});
