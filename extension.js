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
        let positions = {};

        // Проверка каждого файла на наличие определений
        for (const filePath of macroFilePaths) {
            const document = await vscode.workspace.openTextDocument(filePath);
            const text = document.getText();
            const macroPattern = new RegExp(`^[ \\t]*macro\\s+${selectedText}\\s*\\(([^)]*)\\)\\s*{?`, 'gm');
            const paramPattern = new RegExp(`^[ \\t]*param\\s+${selectedText}\\s+.*`, 'gm');
            const flashPattern = new RegExp(`^[ \\t]*flash\\s+${selectedText}\\s*{?`, 'gm');
            
            let match;
            while ((match = macroPattern.exec(text)) !== null) {
                const macroStartIndex = match.index;
                const macroLine = document.positionAt(macroStartIndex).line;

                macroPos = {
                    filePath: filePath,
                    position: new vscode.Position(macroLine, 0)
                };

                if (!positions.hasOwnProperty('Макрос')) {
                    positions['Макрос'] = [];
                };

                positions['Макрос'].push(macroPos)
            }

            while ((match = paramPattern.exec(text)) !== null) {
                const paramStartIndex = match.index;
                const paramLine = document.positionAt(paramStartIndex).line;

                paramPos = {
                    filePath: filePath,
                    position: new vscode.Position(paramLine, 0)
                };

                if (!positions.hasOwnProperty('Параметр')) {
                    positions['Параметр'] = [];
                };

                positions['Параметр'].push(paramPos)
            }
            
            while ((match = flashPattern.exec(text)) !== null) {
                const flashStartIndex = match.index;
                const flashLine = document.positionAt(flashStartIndex).line;

                flashPos = {
                    filePath: filePath,
                    position: new vscode.Position(flashLine, 0)
                };

                if (!positions.hasOwnProperty('Флешка')) {
                    positions['Флешка'] = [];
                };

                positions['Флешка'].push(flashPos)
            }
        }

        // Обработка найденный определений
        types = Object.keys(positions);
        if (types.length === 0){
            // Если определение не найдено
            vscode.window.showInformationMessage(`Определение "${selectedText}" не найдено.`);
        } else if (types.length === 1){
            // Если только один тип определений
            await handlePositions(positions[types[0]], editor, selectedText);
        }else {
            // Если несколько типов определений
            items = [];
            for (const ttype of types){
                items.push({
                    label: ttype,
                });
            }

            const selectedItem = await vscode.window.showQuickPick(items, {
                placeHolder: 'Выберите вариант поиска'
            });

            if (selectedItem.label === "Макрос") {
                await handlePositions(positions["Макрос"], editor, selectedText);
            } else if (selectedItem.label === "Параметр"){
                await handlePositions(positions["Параметр"], editor, selectedText);
            } else if (selectedItem.label === "Флешка"){
                await handlePositions(positions["Флешка"], editor, selectedText);
            }

        };
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
