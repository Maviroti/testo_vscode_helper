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
        let paramPositions = [];

        // Проверка каждого файла на наличие макроса
        for (const filePath of macroFilePaths) {
            const document = await vscode.workspace.openTextDocument(filePath);
            const text = document.getText();
            const macroPattern = new RegExp(`^[ \\t]*macro\\s+${selectedText}\\s*\\(([^)]*)\\)\\s*{?`, 'gm');
            const paramPattern = new RegExp(`^[ \\t]*param\\s+${selectedText}\\s+.*`, 'gm');
            
            let match;
            while ((match = macroPattern.exec(text)) !== null) {
                const macroStartIndex = match.index;
                const macroLine = document.positionAt(macroStartIndex).line;

                macroPositions.push({
                    filePath: filePath,
                    position: new vscode.Position(macroLine, 0)
                });
            }

            while ((match = paramPattern.exec(text)) !== null) {
                const paramStartIndex = match.index;
                const paramLine = document.positionAt(paramStartIndex).line;

                paramPositions.push({
                    filePath: filePath,
                    position: new vscode.Position(paramLine, 0)
                });
            }
        }

        // Если найдены определения макроса
        if (macroPositions.length > 0 && paramPositions.length === 0) {
            await handlePositions(macroPositions, editor, selectedText);
        } else if (macroPositions.length === 0 && paramPositions.length > 0) {
            await handlePositions(paramPositions, editor, selectedText);
        } else if (macroPositions.length > 0 && paramPositions.length > 0){
            // Eсли есть одноимённый параметр и макрос, показываем меню выбора
            items = [
                ({
                    label: "Макрос",
                    description: "Осуществить поиск по макросам"
                }),
                ({
                    label: "Параметр",
                    description: "Осуществить поиск по параметрам"
                })
            ]
            const selectedItem = await vscode.window.showQuickPick(items, {
                placeHolder: 'Выберите вариант поиска'
            });
    
            if (selectedItem.label === "Макрос") {
                await handlePositions(macroPositions, editor, selectedText);
            } else if (selectedItem.label === "Параметр"){
                await handlePositions(paramPositions, editor, selectedText);
            }
        } else if (macroPositions.length === 0 && paramPositions.length === 0){
            // Если макрос не найден в любом из файлов
            vscode.window.showInformationMessage(`Определение "${selectedText}" не найдено.`);
        } else {
            console.log("ERR что-то пошло не так")
            console.log("macroPositions.length = ", macroPositions.length)
            console.log("paramPositions.length  = ", paramPositions.length )
        }
    });

    context.subscriptions.push(disposable);
}

// Функция для обработки найденных позиций
async function handlePositions(positions, editor, selectedText) {
    if (positions.length === 1) {
        const { filePath } = positions[0];
        
        if (filePath === editor.document.fileName) {
            await goToMacroDefinitionInSameFile(positions[0], editor);
        } else {
            await openDocumentAndSelect(positions[0]);
        }
    } else {
            // Если найдено несколько определений, показываем меню выбора
        const items = positions.map((macro) => ({
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
                await goToMacroDefinitionInSameFile(selectedItem, editor);
            } else {
                await openDocumentAndSelect(selectedItem);
            }
        }
    }
}

// Функция для открытия документа и перемещения курсора
async function openDocumentAndSelect(macroPosition) {
    const document = await vscode.workspace.openTextDocument(macroPosition.filePath);
    await vscode.window.showTextDocument(document);
    
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        activeEditor.selection = new vscode.Selection(macroPosition.position, macroPosition.position);
        activeEditor.revealRange(new vscode.Range(macroPosition.position, macroPosition.position));
    }
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
       // Если открыто несколько редакторов, перемещаем курсор в текущем редакторе
       editor.selection = new vscode.Selection(position, position);
       editor.revealRange(new vscode.Range(position, position));
   }
}

function deactivate() {}

module.exports = {
   activate,
   deactivate
};
