// 文件路径：miniprogram/pages/create/create.js
// 发起投票页：头像昵称填写、问题必填限长、动态增删 2-10 个选项、过期时间校验、提交前完整校验
const { call } = require('../../utils/util.js');

const QUESTION_MAX = 50;   // 问题最大长度
const OPTION_MAX_LEN = 30; // 单个选项最大长度
const OPTION_MIN = 2;
const OPTION_MAX = 10;
const IMAGE_MAX_SIZE = 5 * 1024 * 1024; // 问题图片最大 5MB

Page({
  data: {
    avatarUrl: '',    // 头像（chooseAvatar 返回的临时路径）
    nickName: '',     // 昵称
    question: '',     // 投票问题
    questionImage: '',// 问题配图（本地临时路径，选填，最多 1 张）
    options: ['', ''],// 选项数组，默认 2 个
    expireDate: '',   // 过期日期 YYYY-MM-DD
    expireTime: '',   // 过期时间 HH:mm
    today: '',        // 日期选择器最小值
    maxDate: '',      // 日期选择器最大值（一年后）
    submitting: false
  },

  onLoad() {
    // 初始化日期选择范围：今天 ~ 一年后
    const now = new Date();
    const pad = n => (n < 10 ? '0' + n : '' + n);
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const nextYear = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    this.setData({ today: fmt(now), maxDate: fmt(nextYear) });
  },

  // 微信头像昵称填写能力：选择头像
  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl });
  },

  // 微信头像昵称填写能力：填写昵称（input type="nickname" 唤起微信昵称）
  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value.trim() });
  },

  // 问题输入
  onQuestionInput(e) {
    this.setData({ question: e.detail.value });
  },

  // 选择问题配图（选填，最多 1 张）
  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'], // 优先压缩图，节省上传流量与存储
      success: (res) => {
        const file = res.tempFiles[0];
        if (file.size > IMAGE_MAX_SIZE) {
          wx.showToast({ title: '图片不能超过5MB', icon: 'none' });
          return;
        }
        this.setData({ questionImage: file.tempFilePath });
      },
      fail: (e) => {
        // 用户取消选择也会进 fail，仅真正出错时提示
        if (e.errMsg && e.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        }
      }
    });
  },

  // 移除已选的问题配图
  onRemoveImage() {
    this.setData({ questionImage: '' });
  },

  // 预览已选的问题配图
  onPreviewImage() {
    if (!this.data.questionImage) return;
    wx.previewImage({ urls: [this.data.questionImage] });
  },

  // 选项输入
  onOptionInput(e) {
    const idx = e.currentTarget.dataset.idx;
    const key = `options[${idx}]`;
    this.setData({ [key]: e.detail.value });
  },

  // 添加选项（最多 10 个）
  onAddOption() {
    if (this.data.options.length >= OPTION_MAX) {
      wx.showToast({ title: '最多支持10个选项', icon: 'none' });
      return;
    }
    this.setData({ options: this.data.options.concat(['']) });
  },

  // 删除选项（最少保留 2 个）
  onRemoveOption(e) {
    if (this.data.options.length <= OPTION_MIN) {
      wx.showToast({ title: '至少需要2个选项', icon: 'none' });
      return;
    }
    const idx = e.currentTarget.dataset.idx;
    const options = this.data.options.filter((_, i) => i !== idx);
    this.setData({ options });
  },

  // 选择过期日期 / 时间
  onDateChange(e) {
    this.setData({ expireDate: e.detail.value });
  },
  onTimeChange(e) {
    this.setData({ expireTime: e.detail.value });
  },

  // 头像为本地临时路径时先上传云存储，返回 fileID；失败则降级为空
  async uploadAvatarIfNeeded() {
    const url = this.data.avatarUrl;
    if (!url) return '';
    try {
      const ext = (url.split('.').pop() || 'png').split('?')[0];
      const res = await wx.cloud.uploadFile({
        cloudPath: `avatars/${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`,
        filePath: url
      });
      return res.fileID;
    } catch (e) {
      // 上传失败必须显式暴露：打印完整错误并提示用户，避免静默降级后排查无门
      console.error('头像上传失败，fileID 将为空', e);
      wx.showToast({ title: '头像上传失败，将使用默认头像', icon: 'none', duration: 2500 });
      return '';
    }
  },

  // 提交前完整校验
  validate() {
    const q = this.data.question.trim();
    if (!q) return '请输入投票问题';
    if (q.length > QUESTION_MAX) return '问题不能超过50字';

    const opts = this.data.options.map(t => t.trim()).filter(t => t.length > 0);
    if (opts.length < OPTION_MIN) return '至少需要2个选项';
    if (opts.length > OPTION_MAX) return '最多支持10个选项';
    if (opts.some(t => t.length > OPTION_MAX_LEN)) return '单个选项不能超过30字';
    if (new Set(opts).size !== opts.length) return '选项内容不能重复';

    if (!this.data.expireDate || !this.data.expireTime) return '请选择过期时间';
    const expireAt = new Date(`${this.data.expireDate}T${this.data.expireTime}:00`).getTime();
    if (isNaN(expireAt)) return '过期时间格式错误';
    // 过期时间必须晚于当前时间（至少 1 分钟，与服务端一致）
    if (expireAt <= Date.now() + 60 * 1000) return '过期时间必须晚于当前时间';

    return '';
  },

  // 问题图片上传云存储，返回 fileID；未选择返回 ''；上传失败抛错中止提交（不静默丢图）
  async uploadQuestionImage() {
    const url = this.data.questionImage;
    if (!url) return '';
    const ext = (url.split('.').pop() || 'png').split('?')[0];
    const res = await wx.cloud.uploadFile({
      cloudPath: `vote-images/${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`,
      filePath: url
    });
    return res.fileID;
  },

  // 提交
  async onSubmit() {
    if (this.data.submitting) return;
    const errMsg = this.validate();
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });
    try {
      // 先上传头像与问题图片（如有），再创建投票
      const avatarFileID = await this.uploadAvatarIfNeeded();
      let imageFileID = '';
      try {
        imageFileID = await this.uploadQuestionImage();
      } catch (e) {
        // 图片是用户主动添加的内容，上传失败必须中止并让用户决定，不能静默丢弃
        wx.hideLoading();
        console.error('问题图片上传失败', e);
        wx.showModal({
          title: '图片上传失败',
          content: '是否不带图片发起投票？',
          confirmText: '不带图发起',
          cancelText: '重试',
          success: (m) => {
            if (m.confirm) {
              // 先重置提交锁再重新提交，否则会被 onSubmit 开头的 submitting 检查拦截
              this.setData({ questionImage: '', submitting: false });
              this.onSubmit();
            } else {
              this.setData({ submitting: false });
            }
          }
        });
        return;
      }
      const expireAt = new Date(`${this.data.expireDate}T${this.data.expireTime}:00`).getTime();
      const res = await call('vote_create', {
        question: this.data.question.trim(),
        questionImage: imageFileID,
        options: this.data.options.map(t => t.trim()).filter(t => t.length > 0),
        expireAt,
        creatorName: this.data.nickName,
        creatorAvatar: avatarFileID
      }, { showLoading: false });

      wx.hideLoading();
      if (res.code === 'OK') {
        wx.showToast({ title: '发起成功', icon: 'success' });
        // 返回列表页，列表 onShow 会自动刷新
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        wx.showToast({ title: res.message || '发起失败', icon: 'none' });
        this.setData({ submitting: false });
      }
    } catch (e) {
      wx.hideLoading();
      console.error('发起投票失败', e);
      wx.showToast({ title: '发起失败，请稍后重试', icon: 'none' });
      this.setData({ submitting: false });
    }
  }
});
