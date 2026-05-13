# Changelog e controle de alterações

A partir da **baseline documentada aqui**, as entregas relevantes devem ser **registradas** neste arquivo. O rollback confiável continua sendo via **Git** (commits + tags).

## Voltar atrás rapidamente

1. Liste tags: `git tag -l "*baseline*" "*v*" --sort=-creatordate`
2. Histórico resumido: `git log --oneline -30`
3. **Inspecionar** um estado antigo (somente leitura):  
   `git checkout <hash-ou-tag>`  
   Para voltar a branch atual: `git checkout main` ou `git checkout master` (ou o nome da sua branch).
4. **Desfazer** uma entrega já commitada mantendo histórico: `git revert <hash>`
5. Com **mudanças locais não commitadas**, antes de checkout use: `git stash push -u -m "WIP antes de rollback"`

Guardar um ponto estável antes de experimentos grandes:

```bash
git tag -a antes-<tema>-YYYY-MM-DD -m "Estado estável antes de <tema>"
git push origin refs/tags/antes-<tema>-YYYY-MM-DD
```

Versões “oficiais” (opcional):

```bash
git tag -a v0.2.0 -m "Descrição da entrega"
```

## Fluxo recomendado (daqui em diante)

| Momento | Ação |
|--------|------|
| Antes de bloco grande de mudanças | Tag opcional `antes-<tema>-data` no commit atual |
| Ao terminar algo entregável | Entrada nova abaixo (data + bullets) ou versão tipo `## [0.2.0] - AAAA-MM-DD` |
| Algo ficou incorreto | `git revert` série de commits ou `git checkout tag/commit` conforme acima |

## [Unreleased]

### Adicionado

- Este `CHANGELOG.md` e o processo de controle para facilitar rollback e rastrear entregas.

---

## Histórico anterior

Alterações antes deste arquivo: use `git log --oneline` e, se precisar de um marcador retroativo em um commit que você considere “último bom”, pode criar tag apontando para esse hash:

```bash
git tag -a baseline-pre-CHANGELOG -m "Último estado antes do changelog" <hash-do-commit>
```
