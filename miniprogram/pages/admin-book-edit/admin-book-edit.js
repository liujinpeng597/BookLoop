const { getNavBarInfo } = require('../../utils/util')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    bookId: '',
    title: '',
    author: '',
    price: '',
    originalPrice: '',
    isbn: '',
    category: '教材',
    condition: '八成新',
    description: '',
    coverUrl: '',
    tempCoverUrl: '',
    pickupAddress: '西区七公寓512',
    categories: ['教材', '其他', '考研', '文学', '生活'],
    conditions: ['全新', '九成新', '八成新', '七成新']
  },

  onLoad(options) {
    this.setData(getNavBarInfo())

    if (options.id) {
      this.setData({ bookId: options.id })
      this.loadBookDetail()
    }
  },

  // 获取要编辑的书籍原有信息
  loadBookDetail() {
    wx.showLoading({ title: '加载书籍信息' })
    wx.cloud.callFunction({
      name: 'getBookDetail', 
      data: { bookId: this.data.bookId },
      success: res => {
        wx.hideLoading()
        if (res.result && res.result.data) {
          const b = res.result.data
          this.setData({
            title: b.title || '', 
            author: b.author || '', 
            isbn: b.isbn || '', 
            price: b.price || '',
            originalPrice: b.originalPrice || '', 
            category: b.category || '教材',
            condition: b.condition || '八成新', 
            coverUrl: b.coverUrl || '',
            description: b.description || b.desc || '', 
            pickupAddress: b.pickupAddress || '西区七公寓512'
          })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '信息加载失败', icon: 'none' })
      }
    })
  },

  // 统一的输入框处理函数
  onInput(e) { 
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value }) 
  },

  // 分类选择器改变
  onCategoryChange(e) { 
    this.setData({ category: this.data.categories[e.detail.value] }) 
  },

  // 品相选择器改变
  onConditionChange(e) { 
    this.setData({ condition: this.data.conditions[e.detail.value] }) 
  },

  // 扫码获取书籍信息
  onScanISBN() {
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['barCode', 'ean13', 'ean8', 'qrCode'],
      success: res => {
        const isbn = res.result.trim()
        this.setData({ isbn })
        wx.showLoading({ title: '正在识别书籍...', mask: true })

        wx.cloud.callFunction({
          name: 'fetchBookByISBN',
          data: { isbn },
          success: apiRes => {
            wx.hideLoading()
            if (apiRes.result && apiRes.result.success) {
              const d = apiRes.result.data
              this.setData({
                title: d.title || '',
                author: d.author || '',
                isbn: d.isbn || isbn,
                price: d.price || '',
                description: d.description || '',
                coverUrl: d.coverUrl || '',
                tempCoverUrl: ''
              })
              wx.showToast({ title: '识别成功，信息已自动填入', icon: 'success' })
            } else {
              this.setData({ isbn })
              wx.showToast({ title: apiRes.result.msg || '未查到该书', icon: 'none' })
            }
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '查询失败，请手动填写', icon: 'none' })
          }
        })
      },
      fail: err => {
        if (err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '扫码失败，请重试', icon: 'none' })
        }
      }
    })
  },

  // 用户点击上传封面
  onUploadCover() {
    wx.chooseMedia({
      count: 1, 
      mediaType: ['image'], 
      sizeType: ['compressed'],
      success: (res) => {
        // 先存一个本地临时路径用于预览
        this.setData({ tempCoverUrl: res.tempFiles[0].tempFilePath })
      }
    })
  },

  // 核心：上传图片到云存储
  uploadFile(tempPath) {
    const match = /\.[^\.]+$/.exec(tempPath)
    const suffix = match ? match[0] : '.jpg'
    const cloudPath = `books/${new Date().getTime()}${suffix}`
    return wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempPath
    })
  },

  // 提交表单
  onSubmit() {
    const d = this.data

    // 1. 基础拦截
    if (!d.title || !d.price || !d.pickupAddress) {
      return wx.showToast({ title: '核心信息未填写完整', icon: 'none' })
    }

    wx.showLoading({ title: '正在加密上传...', mask: true })

    // 2. 处理图片逻辑：如果有新图，就上传新图；没选新图，就用原来的 coverUrl
    const uploadTask = d.tempCoverUrl ? this.uploadFile(d.tempCoverUrl) : Promise.resolve({ fileID: d.coverUrl })
    
    uploadTask.then(res => {
      // 3. 动态决定调用哪个云函数
      const functionName = d.bookId ? 'editBook' : 'addBook'
      
      return wx.cloud.callFunction({
        name: functionName,
        data: {
          bookId: d.bookId, 
          title: d.title, 
          author: d.author, 
          isbn: d.isbn, 
          coverUrl: res.fileID, // 这里拿到的是最终的真实云ID
          price: Number(d.price), 
          originalPrice: Number(d.originalPrice) || 0,
          category: d.category, 
          condition: d.condition, 
          description: d.description, 
          pickupAddress: d.pickupAddress.trim()
        }
      })
    }).then(res => {
      wx.hideLoading()
      if (res.result && res.result.success) { 
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500) 
      } else {
        wx.showToast({ title: '服务器开小差了', icon: 'none' })
      }
    }).catch(err => {
      console.error('提交异常:', err)
      wx.hideLoading()
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  // 取消并返回
  onCancel() { 
    wx.navigateBack() 
  }
})