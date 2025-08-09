const { logImpressao } = require('../utils/logger'); // coloque essa função em utils/logger.js

async function imprimirEtiquetas(payload) {
    // ...restante do código
    for (const [storeKey, etiquetas] of Object.entries(agrupados)) {
        const printerInfo = printersConfig[storeKey];
        // ...verificações

        for (const etiqueta of etiquetas) {
            // ...Geração e impressão do ZPL
            const quantidade = Number(etiqueta.etiquetas) || 1;
            const now = new Date();

            let status = 'impresso';
            let mensagem = 'OK';

            try {
                await new Promise((resolve, reject) => {
                    exec(`lp -d ${printerInfo.impressora} ${zplPath}`, (error, stdout, stderr) => {
                        if (error) {
                            status = 'erro';
                            mensagem = stderr;
                            return reject(error);
                        }
                        mensagem = stdout;
                        resolve();
                    });
                });
            } catch (err) {
                // erro já capturado
            }
            fs.unlinkSync(zplPath);

            // Registro de LOG
            logImpressao({
                data: now.toISOString().split('T')[0], // YYYY-MM-DD
                hora: now.toTimeString().split(' ')[0], // HH:MM:SS
                store_key: storeKey,
                nm_empresa: etiqueta.nm_empresa,
                id_produto: etiqueta.id_produto,
                nome_produto: etiqueta.nome,
                quantidade: quantidade,
                impressora: printerInfo.impressora,
                status: status,
                mensagem: mensagem,
                anydesk_id: process.env.ANYDESK_ID || 'N/A'
            });

            resultados.push({
                id: etiqueta.id_produto,
                store_key: storeKey,
                status: status,
                mensagem: mensagem
            });
        }
    }
    return resultados;
}
