/**
 * Docs2Slides - GoogleドキュメントからGoogleスライドを自動生成するWebアプリ
 *
 * メインエントリーポイント: Webアプリのハンドラーとユーティリティ
 */

// ========== Webアプリ ハンドラー ==========

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Docs2Slides - プレゼンテーション自動生成')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * HTMLファイルのインクルード用ヘルパー
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ========== メイン処理 ==========

/**
 * ドキュメントからスライドを生成するメイン関数
 * @param {Object} params - パラメータ
 * @param {string} params.docUrl - GoogleドキュメントのURL
 * @param {string} params.templateUrl - テンプレートスライドのURL
 * @param {string} params.geminiApiKey - Gemini APIキー
 * @param {string} params.outputTitle - 出力スライドのタイトル
 * @return {Object} 結果オブジェクト {success, slideUrl, message}
 */
function generateSlides(params) {
  try {
    // 1. パラメータ検証
    validateParams(params);

    // 2. ドキュメントをパース
    var slides = DocumentParser.parse(params.docUrl);
    if (!slides || slides.length === 0) {
      throw new Error('ドキュメントからスライド情報を取得できませんでした。フォーマットを確認してください。');
    }

    // 3. テンプレートをコピーして新しいプレゼンテーションを作成
    var templateId = extractFileId(params.templateUrl);
    var outputTitle = params.outputTitle || 'Docs2Slides_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
    var newPresentation = DriveApp.getFileById(templateId).makeCopy(outputTitle);
    var presentationId = newPresentation.getId();

    // 4. スライドを生成
    SlideGenerator.generate(presentationId, slides, params.geminiApiKey);

    var slideUrl = 'https://docs.google.com/presentation/d/' + presentationId + '/edit';

    return {
      success: true,
      slideUrl: slideUrl,
      message: slides.length + '枚のスライドを生成しました。'
    };
  } catch (e) {
    Logger.log('Error in generateSlides: ' + e.message + '\n' + e.stack);
    return {
      success: false,
      slideUrl: '',
      message: 'エラーが発生しました: ' + e.message
    };
  }
}

// ========== ユーティリティ ==========

/**
 * Googleドキュメント/スライドのURLからファイルIDを抽出
 */
function extractFileId(url) {
  // /d/ID/ パターン
  var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // id=ID パターン
  match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // IDそのものが渡された場合
  if (/^[a-zA-Z0-9_-]+$/.test(url)) return url;

  throw new Error('URLからファイルIDを抽出できませんでした: ' + url);
}

/**
 * パラメータの検証
 */
function validateParams(params) {
  if (!params.docUrl) {
    throw new Error('GoogleドキュメントのURLを指定してください。');
  }
  if (!params.templateUrl) {
    throw new Error('テンプレートスライドのURLを指定してください。');
  }
  if (!params.geminiApiKey) {
    throw new Error('Gemini APIキーを指定してください。');
  }
}

/**
 * テンプレートスライドのレイアウト情報を取得（プレビュー用）
 */
function getTemplateInfo(templateUrl) {
  try {
    var templateId = extractFileId(templateUrl);
    var presentation = SlidesApp.openById(templateId);
    var slides = presentation.getSlides();

    var layouts = slides.map(function(slide, index) {
      var elements = slide.getPageElements().map(function(el) {
        return {
          type: el.getPageElementType().toString(),
          title: el.getTitle() || '',
          description: el.getDescription() || ''
        };
      });
      return {
        index: index,
        objectId: slide.getObjectId(),
        elementCount: elements.length,
        elements: elements
      };
    });

    return {
      success: true,
      title: presentation.getName(),
      slideCount: slides.length,
      layouts: layouts
    };
  } catch (e) {
    return {
      success: false,
      message: 'テンプレート情報の取得に失敗しました: ' + e.message
    };
  }
}
