# seruvo-e2e-data

Aplicação **temporária** para o teste E2E dos recursos de dados do Seruvo. Apague o repositório
ao fim do teste.

| Rota | Token | O que faz |
| --- | --- | --- |
| `GET /healthz` | não | saúde |
| `GET /env/check` | sim | presença de `BUILD_ONLY` / `E2E_TOKEN` no build e no runtime (sem valores) |
| `GET /db/status` | sim | `SELECT 1`, banco, host interno e contagem (somente leitura) |
| `POST /db/write` | sim | grava um registro em `e2e_records` |
| `GET /file/status` | sim | lê o contador em `/data/counter.json` |
| `POST /file/write` | sim | incrementa o contador (escrita atômica) |

Token: cabeçalho `x-e2e-token` igual à variável `E2E_TOKEN` (só runtime). Porta 3000.
