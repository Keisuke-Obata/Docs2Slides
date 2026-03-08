/**
 * SlideGenerator - テンプレートを使用してスライドを生成する
 *
 * テンプレートの1枚目をベースレイアウトとして使用し、
 * フォント・サイズ・色を維持したままテキストを置換する
 */
var SlideGenerator = (function() {

  /**
   * スライドを生成するメイン関数
   * @param {string} presentationId - コピー済みプレゼンテーションのID
   * @param {Array<Object>} slideDataArray - パース済みスライドデータの配列
   * @param {string} apiKey - Claude APIキー
   */
  function generate(presentationId, slideDataArray, apiKey) {
    var presentation = SlidesApp.openById(presentationId);
    var templateSlides = presentation.getSlides();

    if (templateSlides.length === 0) {
      throw new Error('テンプレートにスライドがありません。');
    }

    // テンプレートの1枚目をベースとして使用
    var baseSlide = templateSlides[0];

    // 2枚目以降のスライドをbaseSlideから複製して先に用意する
    for (var i = 1; i < slideDataArray.length; i++) {
      presentation.appendSlide(baseSlide);
    }

    // テンプレートに元々2枚目以降があれば削除
    var allSlides = presentation.getSlides();
    for (var j = allSlides.length - 1; j >= slideDataArray.length; j--) {
      allSlides[j].remove();
    }

    // 各スライドにコンテンツを配置
    var slides = presentation.getSlides();
    for (var k = 0; k < slideDataArray.length; k++) {
      var slide = slides[k];
      var placeholders = analyzePlaceholders(slide);
      Logger.log('Slide ' + k + ' placeholders: title=' + (placeholders.title ? placeholders.title.text : 'null') +
        ', message=' + (placeholders.message ? placeholders.message.text : 'null') +
        ', body=' + (placeholders.body ? 'found' : 'null'));
      populateSlide(slide, slideDataArray[k], placeholders, apiKey, presentationId);

      // API レートリミット回避: スライド間に1秒のウェイト
      if (k < slideDataArray.length - 1) {
        Utilities.sleep(1000);
      }
    }

    presentation.saveAndClose();
  }

  /**
   * テンプレートスライドのプレースホルダーを解析
   * テキストを含むShapeのみを対象とし、位置・サイズから役割を推定する
   */
  function analyzePlaceholders(slide) {
    var elements = slide.getPageElements();
    var textBoxes = [];

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
        var shape = el.asShape();
        var textContent = shape.getText().asString().trim();
        // テキストが空のシェイプ（装飾・背景）は除外
        if (!textContent) continue;

        var top = el.getTop();
        var left = el.getLeft();
        var width = el.getWidth();
        var height = el.getHeight();

        textBoxes.push({
          element: shape,
          objectId: el.getObjectId(),
          top: top,
          left: left,
          width: width,
          height: height,
          text: textContent,
          area: width * height
        });
      }
    }

    // 位置でソート（上から下、左から右）
    textBoxes.sort(function(a, b) {
      var topDiff = a.top - b.top;
      if (Math.abs(topDiff) < 20) {
        return a.left - b.left;
      }
      return topDiff;
    });

    var result = {
      title: null,
      message: null,
      body: null,
      allTextBoxes: textBoxes,
      allElements: elements
    };

    if (textBoxes.length === 0) return result;

    // 最上部の小さめのテキストボックス = タイトル
    result.title = textBoxes[0];

    if (textBoxes.length >= 2) {
      // 2番目のテキストボックス = メッセージ
      result.message = textBoxes[1];
    }

    if (textBoxes.length >= 3) {
      // 3番目以降で最も面積が大きいもの = ボディ
      var bodyCandidate = textBoxes[2];
      for (var j = 3; j < textBoxes.length; j++) {
        if (textBoxes[j].area > bodyCandidate.area) {
          bodyCandidate = textBoxes[j];
        }
      }
      result.body = bodyCandidate;
    }

    return result;
  }

  /**
   * スライドにコンテンツを配置
   */
  function populateSlide(slide, slideData, placeholders, apiKey, presentationId) {
    // タイトルの置換（フォーマット保持）
    if (placeholders.title && slideData.title) {
      replaceTextPreservingFormat(placeholders.title.element, slideData.title);
    }

    // メッセージの置換（フォーマット保持）
    if (placeholders.message && slideData.message) {
      replaceTextPreservingFormat(placeholders.message.element, slideData.message);
    }

    // ボディの生成
    if (slideData.body) {
      generateBody(slide, slideData, placeholders, apiKey, presentationId);
    }
  }

  /**
   * テキストをフォーマット（フォント、サイズ、色）を保持したまま置換
   */
  function replaceTextPreservingFormat(shape, newText) {
    var textRange = shape.getText();
    var originalText = textRange.asString();

    if (!originalText.trim()) {
      textRange.setText(newText);
      return;
    }

    // 最初の文字のスタイルを取得
    var firstCharStyle = null;
    if (originalText.length > 0) {
      var runs = textRange.getRuns();
      if (runs.length > 0) {
        firstCharStyle = extractTextStyle(runs[0]);
      }
    }

    // テキストを置換
    textRange.setText(newText);

    // 元のスタイルを適用
    if (firstCharStyle) {
      applyTextStyle(textRange, firstCharStyle);
    }
  }

  /**
   * TextRangeからスタイル情報を抽出
   */
  function extractTextStyle(textRange) {
    var style = textRange.getTextStyle();
    return {
      fontFamily: style.getFontFamily(),
      fontSize: style.getFontSize(),
      foregroundColor: style.getForegroundColor(),
      bold: style.isBold(),
      italic: style.isItalic(),
      underline: style.isUnderline()
    };
  }

  /**
   * TextRangeにスタイルを適用
   */
  function applyTextStyle(textRange, styleInfo) {
    var style = textRange.getTextStyle();
    if (styleInfo.fontFamily) style.setFontFamily(styleInfo.fontFamily);
    if (styleInfo.fontSize) style.setFontSize(styleInfo.fontSize);
    if (styleInfo.foregroundColor) style.setForegroundColor(styleInfo.foregroundColor);
    if (styleInfo.bold !== null) style.setBold(styleInfo.bold);
    if (styleInfo.italic !== null) style.setItalic(styleInfo.italic);
    if (styleInfo.underline !== null) style.setUnderline(styleInfo.underline);
  }

  /**
   * ボディコンテンツを生成
   */
  function generateBody(slide, slideData, placeholders, apiKey, presentationId) {
    // ボディ領域の位置とサイズを決定
    var bodyArea = getBodyArea(placeholders);

    // ボディプレースホルダーを削除（objectIdで正確に特定）
    removeBodyPlaceholder(slide, placeholders);

    // アセットが含まれる場合は先に処理
    var hasAssets = slideData.assets && slideData.assets.length > 0;

    if (hasAssets) {
      // アセット付きのボディ生成
      generateBodyWithAssets(slide, slideData, bodyArea, apiKey, presentationId);
    } else {
      // テキスト＋AI生成コンテンツのボディ
      generateBodyWithAI(slide, slideData, bodyArea, apiKey, presentationId);
    }
  }

  /**
   * ボディ領域の位置・サイズを取得
   */
  function getBodyArea(placeholders) {
    if (placeholders.body) {
      return {
        left: placeholders.body.left,
        top: placeholders.body.top,
        width: placeholders.body.width,
        height: placeholders.body.height
      };
    }

    // ボディプレースホルダーがない場合のデフォルト
    var slideWidth = 720; // 10インチ（ポイント単位）
    var slideHeight = 540; // 7.5インチ

    var topOffset = 150; // タイトル・メッセージ分のオフセット
    if (placeholders.message) {
      topOffset = placeholders.message.top + placeholders.message.height + 10;
    } else if (placeholders.title) {
      topOffset = placeholders.title.top + placeholders.title.height + 50;
    }

    return {
      left: 40,
      top: topOffset,
      width: slideWidth - 80,
      height: slideHeight - topOffset - 30
    };
  }

  /**
   * アセット（図表・画像）を含むボディを生成
   */
  function generateBodyWithAssets(slide, slideData, bodyArea, apiKey, presentationId) {
    var assets = slideData.assets;
    var bodyText = slideData.body;

    // アセットの配置位置を計算
    var assetCount = assets.length;
    var currentTop = bodyArea.top;
    var availableHeight = bodyArea.height;

    // ボディテキスト（アセットプレースホルダーを除いた説明文）を取得
    var textParts = bodyText.split(/\{\{ASSET_\d+\}\}/);
    var assetIndex = 0;

    for (var i = 0; i < textParts.length; i++) {
      var textPart = textParts[i].trim();

      // テキスト部分がある場合
      if (textPart) {
        // AIで構造化テキストを生成してスライドに配置
        var textHeight = Math.min(availableHeight * 0.3, 80);
        addStructuredText(slide, textPart, bodyArea.left, currentTop, bodyArea.width, textHeight);
        currentTop += textHeight + 5;
      }

      // アセットを挿入
      if (assetIndex < assets.length) {
        var asset = assets[assetIndex];
        var assetHeight = availableHeight / (assetCount + textParts.length) * 1.5;
        assetHeight = Math.min(assetHeight, availableHeight * 0.6);

        insertAsset(slide, asset, bodyArea.left, currentTop, bodyArea.width, assetHeight, presentationId);
        currentTop += assetHeight + 5;
        assetIndex++;
      }
    }
  }

  /**
   * AIを使ってボディコンテンツを生成
   */
  function generateBodyWithAI(slide, slideData, bodyArea, apiKey, presentationId) {
    // Claude APIでボディコンテンツの構成を決定
    var bodyPlan = AIService.planBodyContent(slideData, apiKey);

    if (!bodyPlan || !bodyPlan.elements) {
      // AIが使えない場合はシンプルなテキスト配置
      addStructuredText(slide, slideData.body, bodyArea.left, bodyArea.top, bodyArea.width, bodyArea.height);
      return;
    }

    // AIの提案に基づいてコンテンツを配置
    var currentTop = bodyArea.top;
    var elements = bodyPlan.elements;

    for (var i = 0; i < elements.length; i++) {
      var element = elements[i];
      var elementHeight = bodyArea.height / elements.length;

      switch (element.type) {
        case 'text':
          addStructuredText(slide, element.content, bodyArea.left, currentTop, bodyArea.width, elementHeight);
          break;

        case 'bullets':
          addBulletPoints(slide, element.items, bodyArea.left, currentTop, bodyArea.width, elementHeight);
          break;

        case 'table':
          addTable(slide, element.headers, element.rows, bodyArea.left, currentTop, bodyArea.width, elementHeight);
          break;

        case 'chart_description':
          // チャート生成の指示がある場合
          ChartGenerator.createChart(slide, element, bodyArea.left, currentTop, bodyArea.width, elementHeight, apiKey);
          break;

        case 'comparison':
          addComparisonBoxes(slide, element.items, bodyArea.left, currentTop, bodyArea.width, elementHeight);
          break;

        case 'process_flow':
          addProcessFlow(slide, element.steps, bodyArea.left, currentTop, bodyArea.width, elementHeight);
          break;

        default:
          addStructuredText(slide, element.content || '', bodyArea.left, currentTop, bodyArea.width, elementHeight);
      }

      currentTop += elementHeight + 5;
    }
  }

  /**
   * ボディプレースホルダーを削除（objectIdで正確に特定）
   */
  function removeBodyPlaceholder(slide, placeholders) {
    if (placeholders.body && placeholders.body.objectId) {
      try {
        var elements = slide.getPageElements();
        for (var i = 0; i < elements.length; i++) {
          if (elements[i].getObjectId() === placeholders.body.objectId) {
            elements[i].remove();
            break;
          }
        }
      } catch (e) {
        Logger.log('removeBodyPlaceholder error: ' + e.message);
      }
    }
  }

  /**
   * 構造化テキストをスライドに追加
   */
  function addStructuredText(slide, text, left, top, width, height) {
    var shape = slide.insertTextBox(text, left, top, width, height);
    var style = shape.getText().getTextStyle();
    style.setFontSize(11);
    style.setFontFamily('Meiryo');
    return shape;
  }

  /**
   * 箇条書きをスライドに追加
   */
  function addBulletPoints(slide, items, left, top, width, height) {
    if (!items || items.length === 0) return;

    var text = items.map(function(item) {
      if (typeof item === 'string') return item;
      return item.text || '';
    }).join('\n');

    var shape = slide.insertTextBox(text, left, top, width, height);
    var textRange = shape.getText();

    // 箇条書きスタイルを適用
    var paragraphs = textRange.getParagraphs();
    for (var i = 0; i < paragraphs.length; i++) {
      var para = paragraphs[i];
      para.getRange().getParagraphStyle().setIndentStart(20);
    }

    textRange.getTextStyle().setFontSize(10);
    textRange.getTextStyle().setFontFamily('Meiryo');
    return shape;
  }

  /**
   * テーブルをスライドに追加
   */
  function addTable(slide, headers, rows, left, top, width, height) {
    if (!headers || !rows) return;

    var numRows = rows.length + 1; // ヘッダー + データ行
    var numCols = headers.length;

    if (numRows < 1 || numCols < 1) return;

    var table = slide.insertTable(numRows, numCols, left, top, width, height);

    // ヘッダー行
    for (var c = 0; c < numCols; c++) {
      var headerCell = table.getCell(0, c);
      headerCell.getText().setText(headers[c] || '');
      headerCell.getText().getTextStyle().setBold(true);
      headerCell.getText().getTextStyle().setFontSize(9);
      headerCell.getText().getTextStyle().setFontFamily('Meiryo');
      headerCell.getFill().setSolidFill('#4472C4');
      headerCell.getText().getTextStyle().setForegroundColor('#FFFFFF');
    }

    // データ行
    for (var r = 0; r < rows.length; r++) {
      for (var c2 = 0; c2 < numCols; c2++) {
        var cell = table.getCell(r + 1, c2);
        var value = rows[r][c2] !== undefined ? String(rows[r][c2]) : '';
        cell.getText().setText(value);
        cell.getText().getTextStyle().setFontSize(9);
        cell.getText().getTextStyle().setFontFamily('Meiryo');
        if (r % 2 === 1) {
          cell.getFill().setSolidFill('#D6E4F0');
        }
      }
    }

    return table;
  }

  /**
   * 比較ボックスを追加
   */
  function addComparisonBoxes(slide, items, left, top, width, height) {
    if (!items || items.length === 0) return;

    var boxWidth = (width - (items.length - 1) * 10) / items.length;

    for (var i = 0; i < items.length; i++) {
      var boxLeft = left + i * (boxWidth + 10);
      var item = items[i];

      // ボックスの背景
      var box = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, boxLeft, top, boxWidth, height);
      box.getFill().setSolidFill('#E8EEF7');
      box.getBorder().getLineFill().setSolidFill('#4472C4');
      box.getBorder().setWeight(1);

      // タイトル
      var titleText = item.title || item.label || '';
      var titleBox = slide.insertTextBox(titleText, boxLeft + 5, top + 5, boxWidth - 10, 25);
      titleBox.getText().getTextStyle().setBold(true);
      titleBox.getText().getTextStyle().setFontSize(10);
      titleBox.getText().getTextStyle().setFontFamily('Meiryo');
      titleBox.getText().getTextStyle().setForegroundColor('#2F5496');
      titleBox.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

      // 内容
      var contentText = item.content || item.description || '';
      var contentBox = slide.insertTextBox(contentText, boxLeft + 5, top + 35, boxWidth - 10, height - 40);
      contentBox.getText().getTextStyle().setFontSize(9);
      contentBox.getText().getTextStyle().setFontFamily('Meiryo');
    }
  }

  /**
   * プロセスフローを追加
   */
  function addProcessFlow(slide, steps, left, top, width, height) {
    if (!steps || steps.length === 0) return;

    var stepWidth = (width - (steps.length - 1) * 30) / steps.length;
    var arrowWidth = 20;

    for (var i = 0; i < steps.length; i++) {
      var stepLeft = left + i * (stepWidth + 30);

      // ステップボックス
      var box = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, stepLeft, top + 10, stepWidth, height - 20);
      box.getFill().setSolidFill('#4472C4');
      box.getBorder().setTransparent();

      // ステップテキスト
      var stepText = '';
      if (typeof steps[i] === 'string') {
        stepText = steps[i];
      } else {
        stepText = steps[i].title || steps[i].label || '';
        if (steps[i].description) {
          stepText += '\n' + steps[i].description;
        }
      }

      var textBox = slide.insertTextBox(stepText, stepLeft + 5, top + 15, stepWidth - 10, height - 30);
      textBox.getText().getTextStyle().setFontSize(9);
      textBox.getText().getTextStyle().setFontFamily('Meiryo');
      textBox.getText().getTextStyle().setForegroundColor('#FFFFFF');
      textBox.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

      // 矢印（最後のステップ以外）
      if (i < steps.length - 1) {
        var arrowLeft = stepLeft + stepWidth + 5;
        var arrowTop = top + height / 2 - 10;
        var arrow = slide.insertShape(SlidesApp.ShapeType.RIGHT_ARROW, arrowLeft, arrowTop, arrowWidth, 20);
        arrow.getFill().setSolidFill('#A5A5A5');
        arrow.getBorder().setTransparent();
      }
    }
  }

  /**
   * アセットをスライドに挿入
   */
  function insertAsset(slide, asset, left, top, width, height, presentationId) {
    try {
      switch (asset.type) {
        case 'spreadsheet':
          insertSpreadsheetChart(slide, asset, left, top, width, height);
          break;

        case 'image':
        case 'drive_file':
          insertImageFromDrive(slide, asset, left, top, width, height);
          break;

        case 'drawing':
          insertDrawing(slide, asset, left, top, width, height);
          break;

        default:
          // 不明なタイプの場合はプレースホルダーを表示
          addStructuredText(slide, '[図表: ' + asset.url + ']', left, top, width, height);
      }
    } catch (e) {
      Logger.log('Asset insertion error: ' + e.message);
      addStructuredText(slide, '[図表の挿入に失敗: ' + e.message + ']', left, top, width, 30);
    }
  }

  /**
   * スプレッドシートのグラフをスライドに挿入
   */
  function insertSpreadsheetChart(slide, asset, left, top, width, height) {
    var spreadsheet = SpreadsheetApp.openById(asset.fileId);
    var sheet;

    if (asset.sheetName) {
      sheet = spreadsheet.getSheetByName(asset.sheetName);
    } else {
      sheet = spreadsheet.getSheets()[0];
    }

    if (!sheet) {
      throw new Error('シートが見つかりません: ' + asset.sheetName);
    }

    // シートに含まれるチャートを取得
    var charts = sheet.getCharts();
    if (charts.length > 0) {
      // チャートを画像として取得してスライドに挿入
      var chartBlob = charts[0].getBlob();
      slide.insertImage(chartBlob, left, top, width, height);
    } else {
      // チャートがない場合はデータをテーブルとして表示
      var range = asset.range ? sheet.getRange(asset.range) : sheet.getDataRange();
      var values = range.getValues();

      if (values.length > 0) {
        var headers = values[0].map(String);
        var rows = values.slice(1);
        addTable(slide, headers, rows, left, top, width, height);
      }
    }
  }

  /**
   * Google Driveから画像を挿入
   */
  function insertImageFromDrive(slide, asset, left, top, width, height) {
    var file = DriveApp.getFileById(asset.fileId);
    var blob = file.getBlob();
    slide.insertImage(blob, left, top, width, height);
  }

  /**
   * Google Drawingを挿入
   */
  function insertDrawing(slide, asset, left, top, width, height) {
    var file = DriveApp.getFileById(asset.fileId);
    var blob = file.getAs('image/png');
    slide.insertImage(blob, left, top, width, height);
  }

  return {
    generate: generate
  };
})();
