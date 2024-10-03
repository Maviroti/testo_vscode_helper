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
        let macroPositions = [];

        // Проверка каждого файла на наличие макроса
        for (const filePath of macroFilePaths) {
            const document = await vscode.workspace.openTextDocument(filePath);
            const text = document.getText();
            const macroPattern = new RegExp(`^[ \\t]*macro\\s+${selectedText}\\s*\\(([^)]*)\\)\\s*{?`, 'gm');
            
            let match;
            while ((match = macroPattern.exec(text)) !== null) {
                const macroStartIndex = match.index;
                const macroLine = document.positionAt(macroStartIndex).line;

                macroPositions.push({
                    filePath: filePath,
                    position: new vscode.Position(macroLine, 0)
                });
            }
        }

        // Если найдены определения макроса
        if (macroPositions.length > 0) {
            if (macroPositions.length === 1) {
                // Если найдено только одно определение, проверяем, находится ли оно в том же файле
                const { filePath } = macroPositions[0];
                if (filePath === editor.document.fileName) {
                    // Вызываем новую функцию для перехода в том же файле
                    await goToMacroDefinitionInSameFile(macroPositions[0], editor);
                } else {
                    // Если найдено только одно определение в другом файле
                    const document = await vscode.workspace.openTextDocument(filePath);
                    await vscode.window.showTextDocument(document);

                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor) {
                        activeEditor.selection = new vscode.Selection(macroPositions[0].position, macroPositions[0].position);
                        activeEditor.revealRange(new vscode.Range(macroPositions[0].position, macroPositions[0].position));
                    }
                }
            } else {
                // Если найдено несколько определений, показываем меню выбора
                const items = macroPositions.map((macro) => ({
                    label: `${path.basename(macro.filePath)} (строка ${macro.position.line + 1})`,
                    description: macro.filePath,
                    position: macro.position,
                    filePath: macro.filePath
                }));

                const selectedItem = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Выберите файл'
                });

                if (selectedItem) {
                    if (selectedItem.filePath === editor.document.fileName) {
                        // Вызываем новую функцию для перехода в том же файле
                        await goToMacroDefinitionInSameFile(selectedItem, editor);
                    } else {
                        // Если выбран элемент, открываем файл и перемещаем курсор
                        const document = await vscode.workspace.openTextDocument(selectedItem.filePath);
                        await vscode.window.showTextDocument(document);
                        
                        const activeEditor = vscode.window.activeTextEditor;
                        if (activeEditor) {
                            activeEditor.selection = new vscode.Selection(selectedItem.position, selectedItem.position);
                            activeEditor.revealRange(new vscode.Range(selectedItem.position, selectedItem.position));
                        }
                    }
                }
            }
        } else {
            // Если макрос не найден в любом из файлов
            vscode.window.showInformationMessage(`Определение макроса "${selectedText}" не найдено.`);
        }
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

// Функция для перехода к единственному определению макроса в том же файле
async function goToMacroDefinitionInSameFile(macroPosition, editor) {
    const { position } = macroPosition;

    // Получаем список всех открытых редакторов
    const editors = vscode.window.visibleTextEditors;

    if (editors.length === 1) {
        // Если открыт только один редактор, создаем новый и переносим курсор
        const newEditor = await vscode.window.showTextDocument(editor.document, { viewColumn: vscode.ViewColumn.Beside });
        newEditor.selection = new vscode.Selection(position, position);
        newEditor.revealRange(new vscode.Range(position, position));
    } else {
        // Если открыто несколько редакторов, проверяем текущий редактор
        const currentEditorIndex = editors.findIndex(ed => ed.document.uri.toString() === editor.document.uri.toString());
        // Определяем индекс соседнего редактора
        const nextEditorIndex = (currentEditorIndex + 1) % editors.length; // Переход к следующему редактору по кругу
        const nextEditor = editors[nextEditorIndex];

        // Перемещаем курсор в соседнем редакторе
        nextEditor.selection = new vscode.Selection(position, position);
        nextEditor.revealRange(new vscode.Range(position, position));
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
