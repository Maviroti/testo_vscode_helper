const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function activate(context) {
    let disposable = vscode.commands.registerCommand('TestoVscodeHelper.goToMacroDefinition', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return; // Если редактор не активен, ничего не делаем
        }

        // Получаем позицию курсора
        const position = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(position);
        
        // Получаем текст под курсором
        const selectedText = wordRange ? editor.document.getText(wordRange) : '';
        
        if (!selectedText) {
            vscode.window.showInformationMessage('Наведите курсор на макрос для перехода к его определению.');
            return;
        }

        // Получаем путь к корневой папке рабочего пространства
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;

        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Рабочее пространство не открыто.');
            return;
        }

        // Поиск всех файлов в рабочем пространстве
        const macroFilePaths = await findMacroFiles(workspaceFolder);
        let macroPosition = null;

        // Проверка каждого файла на наличие макроса
        for (const filePath of macroFilePaths) {
            const document = await vscode.workspace.openTextDocument(filePath);
            const text = document.getText();
            const macroPattern = new RegExp(`^[ \\t]*macro\\s+${selectedText}\\s*\\(([^)]*)\\)\\s*{?`, 'gm');
            
            let match;
            while ((match = macroPattern.exec(text)) !== null) {
                const macroStartIndex = match.index;
                const macroLine = document.positionAt(macroStartIndex).line;

                macroPosition = new vscode.Position(macroLine, 0);
                break; // Находим только первое вхождение
            }

            if (macroPosition) {
                
                // Если найдено определение макроса, перемещаем курсор
                await vscode.window.showTextDocument(document);
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    editor.selection = new vscode.Selection(macroPosition, macroPosition);
                    editor.revealRange(new vscode.Range(macroPosition, macroPosition));
                }
                return; // Завершаем выполнение после нахождения первого макроса
            }
        }

        // Если макрос не найден в любом из файлов
        vscode.window.showInformationMessage(`Определение макроса "${selectedText}" не найдено.`);
    });

    context.subscriptions.push(disposable);
}

// Функция для поиска всех файлов в рабочем пространстве
async function findMacroFiles(dir) {
    let results = [];
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat && stat.isDirectory()) {
            results = results.concat(await findMacroFiles(filePath)); // Рекурсивный поиск в подпапках
        } else if (file.endsWith('.testo')) { // Укажите здесь нужное расширение файлов с макросами
            results.push(filePath); // Добавляем файл с макросами в результаты
        }
    }

    return results;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};