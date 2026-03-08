/**
 * AIService - Claude APIを使用してスライドコンテンツを生成する
 */
var AIService = (function() {

  var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
  var CLAUDE_MODEL = 'claude-sonnet-4-20250514';
  var MAX_RETRIES = 3;
  var INITIAL_BACKOFF_MS = 1000;

  /**
   * ボディコンテンツの構成をAIで計画
   * @param {Object} slideData - スライドデータ
   * @param {string} apiKey - Claude APIキー
   * @return {Object} コンテンツ計画
   */
  function planBodyContent(slideData, apiKey) {
    var prompt = buildBodyPlanPrompt(slideData);

    var response = callClaude(prompt, apiKey);
    if (!response) {
      Logger.log('Claude API returned null. Falling back to text.');
      return {
        elements: [{
          type: 'text',
          content: slideData.body
        }]
      };
    }

    try {
      var jsonStr = extractJson(response);
      var parsed = JSON.parse(jsonStr);

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
      '- 日本語で回答してください\n' +
      '- JSONのみを返してください。説明文やマークダウンのコードブロックは不要です';
  }

  /**
   * Claude APIを呼び出す
   * @param {string} prompt - プロンプト
   * @param {string} apiKey - APIキー
   * @return {string|null} レスポンステキスト
   */
  function callClaude(prompt, apiKey) {
    var payload = {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        var response = UrlFetchApp.fetch(CLAUDE_API_URL, options);
        var responseCode = response.getResponseCode();

        // 429 (Rate Limit) または 529 (Overloaded) はリトライ
        if (responseCode === 429 || responseCode === 529) {
          var waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          Logger.log('Claude API rate limited (' + responseCode + '). Retry ' + (attempt + 1) + '/' + MAX_RETRIES + ' after ' + waitMs + 'ms');
          if (attempt < MAX_RETRIES) {
            Utilities.sleep(waitMs);
            continue;
          }
          Logger.log('Claude API: max retries exceeded.');
          return null;
        }

        if (responseCode !== 200) {
          Logger.log('Claude API error: ' + responseCode + ' - ' + response.getContentText());
          return null;
        }

        var json = JSON.parse(response.getContentText());
        if (json.content && json.content.length > 0 && json.content[0].text) {
          return json.content[0].text;
        }
        return null;
      } catch (e) {
        Logger.log('Claude API call error (attempt ' + (attempt + 1) + '): ' + e.message);
        if (attempt < MAX_RETRIES) {
          Utilities.sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
          continue;
        }
        return null;
      }
    }
    return null;
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
    callClaude: callClaude
  };
})();
