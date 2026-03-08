/**
 * AIService - Gemini APIを使用してスライドコンテンツを生成する
 */
var AIService = (function() {

  var GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  /**
   * ボディコンテンツの構成をAIで計画
   * @param {Object} slideData - スライドデータ
   * @param {string} apiKey - Gemini APIキー
   * @return {Object} コンテンツ計画
   */
  function planBodyContent(slideData, apiKey) {
    var prompt = buildBodyPlanPrompt(slideData);

    var response = callGemini(prompt, apiKey, true);
    if (!response) {
      Logger.log('Gemini API returned null. Falling back to text.');
      return {
        elements: [{
          type: 'text',
          content: slideData.body
        }]
      };
    }

    try {
      // JSONレスポンスをパース
      var jsonStr = extractJson(response);
      var parsed = JSON.parse(jsonStr);

      // elementsの妥当性チェック
      if (!parsed.elements || !Array.isArray(parsed.elements) || parsed.elements.length === 0) {
        Logger.log('AI returned invalid structure: ' + jsonStr);
        return {
          elements: [{
            type: 'text',
            content: slideData.body
          }]
        };
      }

      return parsed;
    } catch (e) {
      Logger.log('AI response parse error: ' + e.message + '\nResponse: ' + response);
      return {
        elements: [{
          type: 'text',
          content: slideData.body
        }]
      };
    }
  }

  /**
   * ボディコンテンツ計画用のプロンプトを構築
   */
  function buildBodyPlanPrompt(slideData) {
    return 'あなたはプレゼンテーションスライドのデザイナーです。\n' +
      '以下のスライド情報に基づいて、ボディ部分のレイアウト要素をJSON形式で提案してください。\n\n' +
      'スライド情報:\n' +
      'タイトル: ' + slideData.title + '\n' +
      'メッセージ: ' + slideData.message + '\n' +
      'ボディの指示: ' + slideData.body + '\n\n' +
      '以下のJSON形式で回答してください。elementsは1〜3個にしてください:\n' +
      '{\n' +
      '  "elements": [\n' +
      '    {\n' +
      '      "type": "text" | "bullets" | "table" | "chart_description" | "comparison" | "process_flow",\n' +
      '      "content": "テキストの場合の内容",\n' +
      '      "items": ["箇条書きや比較の場合の項目配列"],\n' +
      '      "headers": ["テーブルのヘッダー"],\n' +
      '      "rows": [["テーブルのデータ行"]],\n' +
      '      "steps": ["プロセスフローのステップ"],\n' +
      '      "chartType": "bar | line | pie | area",\n' +
      '      "chartData": {"labels": [], "values": []}\n' +
      '    }\n' +
      '  ]\n' +
      '}\n\n' +
      '重要な注意事項:\n' +
      '- ボディの指示内容を忠実に反映してください\n' +
      '- 図表が求められている場合はtableやchart_descriptionを使用してください\n' +
      '- comparisonは比較表現に適しています（BeforeAfter、選択肢比較など）\n' +
      '- process_flowはプロセスや手順の説明に適しています\n' +
      '- bulletsは要点列挙に適しています\n' +
      '- 比較の場合、itemsは{title: "タイトル", content: "内容"}のオブジェクト配列にしてください\n' +
      '- プロセスフローの場合、stepsは{title: "ステップ名", description: "説明"}のオブジェクト配列にしてください\n' +
      '- chart_descriptionの場合、chartType, chartData(labels配列とvalues配列), titleを必ず含めてください\n' +
      '- tableの場合、headers(文字列配列)とrows(文字列配列の配列)を必ず含めてください\n' +
      '- 実際のプレゼンで使えるリアルなサンプルデータを生成してください\n' +
      '- 日本語で回答してください';
  }

  /**
   * Gemini APIを呼び出す
   * @param {string} prompt - プロンプト
   * @param {string} apiKey - APIキー
   * @param {boolean} jsonMode - JSON出力モードを使用するか
   * @return {string|null} レスポンステキスト
   */
  function callGemini(prompt, apiKey, jsonMode) {
    var url = GEMINI_API_URL + '?key=' + apiKey;

    var generationConfig = {
      temperature: 0.3,
      topP: 0.8,
      maxOutputTokens: 4096
    };

    // JSON modeを有効化（Gemini APIのStructured Output機能）
    if (jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }

    var payload = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: generationConfig
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      var response = UrlFetchApp.fetch(url, options);
      var responseCode = response.getResponseCode();

      if (responseCode !== 200) {
        Logger.log('Gemini API error: ' + responseCode + ' - ' + response.getContentText());
        return null;
      }

      var json = JSON.parse(response.getContentText());
      if (json.candidates && json.candidates.length > 0 &&
          json.candidates[0].content && json.candidates[0].content.parts) {
        return json.candidates[0].content.parts[0].text;
      }
      return null;
    } catch (e) {
      Logger.log('Gemini API call error: ' + e.message);
      return null;
    }
  }

  /**
   * レスポンスからJSON文字列を抽出
   */
  function extractJson(text) {
    // コードブロック内のJSONを抽出
    var codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // 直接JSONオブジェクトを検出
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    return text.trim();
  }

  return {
    planBodyContent: planBodyContent,
    callGemini: callGemini
  };
})();
