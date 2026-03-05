/**
 * DocumentParser - Googleドキュメントのストーリーラインをパースする
 *
 * ドキュメントフォーマット:
 *
 * ===スライド1===
 * タイトル: スライドのタイトル
 * メッセージ: スライドのキーメッセージ
 * ボディ:
 * ボディの内容（図表の指示、テキスト説明など）
 * [図表: スプレッドシートURL#シート名!範囲] ← 外部図表の挿入指定
 * [画像: Google DriveのURL] ← 画像の挿入指定
 *
 * ===スライド2===
 * ...
 */
var DocumentParser = (function() {

  /**
   * Googleドキュメントをパースしてスライド情報の配列を返す
   * @param {string} docUrl - GoogleドキュメントのURL
   * @return {Array<Object>} スライド情報の配列
   */
  function parse(docUrl) {
    var docId = extractFileId(docUrl);
    var doc = DocumentApp.openById(docId);
    var body = doc.getBody();
    var text = body.getText();

    return parseText(text);
  }

  /**
   * テキストをパースしてスライド情報に変換
   * @param {string} text - ドキュメントの全文テキスト
   * @return {Array<Object>} スライド情報の配列
   */
  function parseText(text) {
    var slides = [];
    // ===スライドN=== or ---スライドN--- or ##スライドN で分割
    var slideBlocks = text.split(/(?:={3,}|—{3,}|-{3,}|#{2,})\s*スライド\s*\d+\s*(?:={3,}|—{3,}|-{3,}|#{0,})/);

    // 最初の空ブロックをスキップ
    for (var i = 0; i < slideBlocks.length; i++) {
      var block = slideBlocks[i].trim();
      if (!block) continue;

      var slideInfo = parseSlideBlock(block);
      if (slideInfo) {
        slides.push(slideInfo);
      }
    }

    return slides;
  }

  /**
   * 1スライド分のテキストブロックをパース
   * @param {string} block - スライドブロックのテキスト
   * @return {Object|null} スライド情報
   */
  function parseSlideBlock(block) {
    var lines = block.split('\n');
    var title = '';
    var message = '';
    var bodyLines = [];
    var assets = [];
    var currentSection = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      if (!trimmed) continue;

      // タイトル行の検出
      var titleMatch = trimmed.match(/^タイトル\s*[:：]\s*(.+)/);
      if (titleMatch) {
        title = titleMatch[1].trim();
        currentSection = 'title';
        continue;
      }

      // メッセージ行の検出
      var msgMatch = trimmed.match(/^メッセージ\s*[:：]\s*(.+)/);
      if (msgMatch) {
        message = msgMatch[1].trim();
        currentSection = 'message';
        continue;
      }

      // ボディセクションの開始検出
      var bodyMatch = trimmed.match(/^ボディ\s*[:：]\s*(.*)/);
      if (bodyMatch) {
        currentSection = 'body';
        if (bodyMatch[1].trim()) {
          bodyLines.push(bodyMatch[1].trim());
        }
        continue;
      }

      // アセット参照の検出 [図表: URL] [画像: URL] [チャート: URL]
      var assetMatch = trimmed.match(/^\[(?:図表|画像|チャート|グラフ|表)\s*[:：]\s*(.+?)\]$/);
      if (assetMatch) {
        var assetInfo = parseAssetReference(assetMatch[1].trim());
        assets.push(assetInfo);
        bodyLines.push('{{ASSET_' + (assets.length - 1) + '}}');
        continue;
      }

      // 現在のセクションに追加
      if (currentSection === 'body') {
        bodyLines.push(trimmed);
      }
    }

    if (!title && !message && bodyLines.length === 0) {
      return null;
    }

    return {
      title: title,
      message: message,
      body: bodyLines.join('\n'),
      assets: assets
    };
  }

  /**
   * アセット参照をパース
   * @param {string} ref - アセット参照文字列
   * @return {Object} アセット情報
   */
  function parseAssetReference(ref) {
    // スプレッドシート参照: URL#シート名!範囲
    var ssMatch = ref.match(/^(.+?)(?:#(.+?))?(?:!(.+))?$/);

    var url = ssMatch ? ssMatch[1].trim() : ref;
    var type = detectAssetType(url);

    var asset = {
      type: type,
      url: url,
      fileId: ''
    };

    try {
      asset.fileId = extractFileId(url);
    } catch (e) {
      // IDが抽出できない場合はURLをそのまま保持
    }

    if (type === 'spreadsheet' && ssMatch) {
      asset.sheetName = ssMatch[2] ? ssMatch[2].trim() : '';
      asset.range = ssMatch[3] ? ssMatch[3].trim() : '';
    }

    return asset;
  }

  /**
   * URLからアセットタイプを検出
   */
  function detectAssetType(url) {
    if (url.match(/spreadsheets/i)) return 'spreadsheet';
    if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)/i)) return 'image';
    if (url.match(/drive\.google\.com/i)) return 'drive_file';
    if (url.match(/docs\.google\.com\/drawings/i)) return 'drawing';
    return 'unknown';
  }

  return {
    parse: parse,
    parseText: parseText  // テスト用に公開
  };
})();
