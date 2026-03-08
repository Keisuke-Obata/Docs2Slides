/**
 * ChartGenerator - スライド上にチャートや図表を生成する
 *
 * Google Slides APIではネイティブチャートの直接作成が制限されるため、
 * Google Sheetsでチャートを生成し、画像としてスライドに挿入する方式を採用
 */
var ChartGenerator = (function() {

  /**
   * AIが提案したチャート要素をスライドに作成
   * @param {Object} slide - スライドオブジェクト
   * @param {Object} element - チャート要素の定義
   * @param {number} left - X座標
   * @param {number} top - Y座標
   * @param {number} width - 幅
   * @param {number} height - 高さ
   * @param {string} apiKey - Gemini APIキー
   */
  function createChart(slide, element, left, top, width, height, apiKey) {
    var chartType = element.chartType || 'bar';
    var chartData = element.chartData;

    if (!chartData || !chartData.labels || !chartData.values) {
      // データが不完全な場合はテキストで表示
      var shape = slide.insertTextBox(
        element.content || '[チャート: データ不足]',
        left, top, width, height
      );
      shape.getText().getTextStyle().setFontSize(10);
      shape.getText().getTextStyle().setFontFamily('Meiryo');
      return;
    }

    try {
      // 一時的なスプレッドシートを作成してチャートを生成
      var chartBlob = createChartInSheet(chartType, chartData, element.title || '');
      if (chartBlob) {
        slide.insertImage(chartBlob, left, top, width, height);
      } else {
        // フォールバック: テーブル形式で表示
        createTableFallback(slide, chartData, left, top, width, height);
      }
    } catch (e) {
      Logger.log('Chart generation error: ' + e.message);
      createTableFallback(slide, chartData, left, top, width, height);
    }
  }

  /**
   * 一時スプレッドシートでチャートを作成し、画像Blobを返す
   */
  function createChartInSheet(chartType, chartData, title) {
    var ss = SpreadsheetApp.create('_Docs2Slides_TempChart_' + Date.now());
    var sheet = ss.getActiveSheet();

    try {
      // データを書き込み
      var labels = chartData.labels;
      var values = chartData.values;

      // ヘッダー行
      sheet.getRange(1, 1).setValue('カテゴリ');

      // valuesが配列の配列（複数系列）か単一配列かを判定
      var isMultiSeries = Array.isArray(values[0]);

      if (isMultiSeries) {
        // 複数系列
        var seriesNames = chartData.seriesNames || [];
        for (var s = 0; s < values.length; s++) {
          sheet.getRange(1, s + 2).setValue(seriesNames[s] || ('系列' + (s + 1)));
        }
        for (var i = 0; i < labels.length; i++) {
          sheet.getRange(i + 2, 1).setValue(labels[i]);
          for (var s2 = 0; s2 < values.length; s2++) {
            sheet.getRange(i + 2, s2 + 2).setValue(values[s2][i] || 0);
          }
        }
      } else {
        // 単一系列
        sheet.getRange(1, 2).setValue('値');
        for (var j = 0; j < labels.length; j++) {
          sheet.getRange(j + 2, 1).setValue(labels[j]);
          sheet.getRange(j + 2, 2).setValue(values[j] || 0);
        }
      }

      // チャートを作成
      var dataRange = sheet.getDataRange();
      var chartBuilder = sheet.newChart()
        .setChartType(getChartType(chartType))
        .addRange(dataRange)
        .setPosition(1, 1, 0, 0)
        .setOption('title', title)
        .setOption('legend', { position: 'bottom' })
        .setOption('width', 600)
        .setOption('height', 400);

      var chart = chartBuilder.build();
      sheet.insertChart(chart);

      // チャートを画像として取得
      SpreadsheetApp.flush();
      var charts = sheet.getCharts();
      var blob = charts[0].getBlob();

      return blob;
    } finally {
      // 一時スプレッドシートを削除
      DriveApp.getFileById(ss.getId()).setTrashed(true);
    }
  }

  /**
   * チャートタイプの文字列をGASのenumに変換
   */
  function getChartType(typeStr) {
    switch (typeStr.toLowerCase()) {
      case 'bar': return Charts.ChartType.BAR;
      case 'column': return Charts.ChartType.COLUMN;
      case 'line': return Charts.ChartType.LINE;
      case 'pie': return Charts.ChartType.PIE;
      case 'area': return Charts.ChartType.AREA;
      case 'scatter': return Charts.ChartType.SCATTER;
      default: return Charts.ChartType.COLUMN;
    }
  }

  /**
   * チャートが生成できない場合のテーブルフォールバック
   */
  function createTableFallback(slide, chartData, left, top, width, height) {
    var headers = ['カテゴリ', '値'];
    var rows = chartData.labels.map(function(label, i) {
      var value = Array.isArray(chartData.values[0])
        ? chartData.values.map(function(v) { return v[i] || 0; }).join(' / ')
        : (chartData.values[i] || 0);
      return [label, String(value)];
    });

    // SlideGeneratorのaddTable相当の処理
    var numRows = rows.length + 1;
    var numCols = headers.length;
    var table = slide.insertTable(numRows, numCols, left, top, width, height);

    for (var c = 0; c < numCols; c++) {
      var headerCell = table.getCell(0, c);
      headerCell.getText().setText(headers[c]);
      headerCell.getText().getTextStyle().setBold(true);
      headerCell.getText().getTextStyle().setFontSize(9);
      headerCell.getText().getTextStyle().setFontFamily('Meiryo');
      headerCell.getFill().setSolidFill('#4472C4');
      headerCell.getText().getTextStyle().setForegroundColor('#FFFFFF');
    }

    for (var r = 0; r < rows.length; r++) {
      for (var c2 = 0; c2 < numCols; c2++) {
        var cell = table.getCell(r + 1, c2);
        cell.getText().setText(String(rows[r][c2]));
        cell.getText().getTextStyle().setFontSize(9);
        cell.getText().getTextStyle().setFontFamily('Meiryo');
        if (r % 2 === 1) {
          cell.getFill().setSolidFill('#D6E4F0');
        }
      }
    }
  }

  return {
    createChart: createChart
  };
})();
