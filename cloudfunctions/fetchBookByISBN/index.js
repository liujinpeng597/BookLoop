const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function httpGet(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location, timeout))
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error('JSON parse failed: ' + data.substring(0, 100))) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

function downloadCover(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadCover(res.headers.location))
      }
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

// 豆瓣代理列表（依次尝试）
const DOUBAN_PROXIES = [
  'https://douban.uieee.xyz/v2/book/isbn/',
  'https://douban-api.uieee.xyz/v2/book/isbn/',
  'https://douban-api-git-master.uieee.xyz/v2/book/isbn/',
]

// Open Library 作者名查询
async function fetchAuthors(authorRefs) {
  if (!authorRefs || authorRefs.length === 0) return ''
  const names = []
  for (const ref of authorRefs.slice(0, 3)) {
    if (!ref.key) continue
    try {
      const authorRes = await httpGet(`https://openlibrary.org${ref.key}.json`, 4000)
      if (authorRes && authorRes.name) names.push(authorRes.name)
    } catch (e) { /* skip */ }
  }
  return names.join('、')
}

exports.main = async (event) => {
  const { isbn } = event
  if (!isbn) return { success: false, msg: '缺少ISBN' }

  const clean = isbn.replace(/[^0-9Xx]/g, '')
  if (!clean || clean.length < 10) return { success: false, msg: 'ISBN格式不正确' }

  let book = null

  // ========== 第1步：豆瓣代理（中文书数据最全，含定价/封面/简介）==========
  for (const proxy of DOUBAN_PROXIES) {
    try {
      const res = await httpGet(proxy + clean, 7000)
      if (res && res.title) {
        // 豆瓣价格可能是字符串 "39.00" 或数字 39
        let price = ''
        if (typeof res.price === 'string') {
          price = parseFloat(res.price).toFixed(2)
        } else if (typeof res.price === 'number' && res.price > 0) {
          price = res.price.toFixed(2)
        }

        // 封面优先大图
        let cover = ''
        if (res.images) {
          cover = res.images.large || res.images.medium || res.images.small || ''
        }
        if (!cover && res.image) cover = res.image

        book = {
          title: (res.title || '').trim(),
          author: res.author ? res.author.join('、') : '',
          isbn: res.isbn13 || res.isbn10 || clean,
          price,
          coverUrl: cover,
          description: (res.summary || '').trim(),
          publisher: (res.publisher || '').trim()
        }
        console.log('豆瓣代理命中:', proxy)
        break
      }
    } catch (e) {
      console.log('豆瓣代理失败:', proxy, e.message)
    }
  }

  // ========== 第2步：Open Library（国际免费API，ISBN覆盖最全）==========
  if (!book || !book.title) {
    try {
      const res = await httpGet(`https://openlibrary.org/isbn/${clean}.json`, 6000)
      if (res && res.title) {
        const author = await fetchAuthors(res.authors)
        let desc = ''
        try {
          const detailRes = await httpGet(`https://openlibrary.org/isbn/${clean}.json?details=true`, 4000)
          if (detailRes && detailRes.description) {
            desc = typeof detailRes.description === 'string'
              ? detailRes.description
              : (detailRes.description.value || '')
          }
        } catch (e) { /* skip */ }

        book = {
          title: res.title || '',
          author,
          isbn: clean,
          price: '',
          coverUrl: res.covers && res.covers.length > 0
            ? `https://covers.openlibrary.org/b/id/${res.covers[0]}-M.jpg`
            : '',
          description: desc,
          publisher: res.publishers ? res.publishers.join('、') : ''
        }
        console.log('Open Library 命中')
      }
    } catch (e) {
      console.log('Open Library 失败:', e.message)
    }
  }

  // ========== 第3步：Google Books（全球覆盖，中文书也还行）==========
  if (!book || !book.title) {
    try {
      const res = await httpGet(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}&maxResults=1`,
        8000
      )
      if (res.items && res.items.length > 0) {
        const info = res.items[0].volumeInfo
        let price = ''
        if (info.listPrice) price = String(info.listPrice.amount || '')
        if (!price && info.retailPrice) price = String(info.retailPrice.amount || '')

        book = {
          title: (info.title || '').trim(),
          author: info.authors ? info.authors.join('、') : '',
          isbn: clean,
          price,
          coverUrl: info.imageLinks
            ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || '')
            : '',
          description: (info.description || '').trim(),
          publisher: (info.publisher || '').trim()
        }
        console.log('Google Books 命中')
      }
    } catch (e) {
      console.log('Google Books 失败:', e.message)
    }
  }

  if (!book || !book.title) {
    return { success: false, msg: '未查到该书信息，请手动填写书名和作者' }
  }

  // 清理描述（截断过长内容）
  if (book.description && book.description.length > 500) {
    book.description = book.description.substring(0, 500) + '...'
  }

  // ========== 下载封面到云存储 ==========
  let cloudCoverUrl = ''
  if (book.coverUrl) {
    try {
      const buffer = await downloadCover(book.coverUrl)
      if (buffer && buffer.length > 0) {
        const uploadRes = await cloud.uploadFile({
          cloudPath: `book-covers/${clean}_${Date.now()}.jpg`,
          fileContent: buffer
        })
        cloudCoverUrl = uploadRes.fileID
      }
    } catch (e) {
      console.log('封面上传失败:', e.message)
    }
  }

  return {
    success: true,
    data: {
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      price: book.price,
      description: book.description,
      publisher: book.publisher,
      coverUrl: cloudCoverUrl || ''
    }
  }
}
