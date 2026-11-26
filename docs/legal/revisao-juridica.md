# Pontos para revisão jurídica

Os textos em `src/features/legal/documents/` foram escritos como ponto de partida e precisam de revisão de um advogado antes
do lançamento público. Cada documento tem uma versão (data ISO); ao alterar o texto, altere a versão e todos os usuários
voltam a aceitar.

## Decisões que o advogado deve confirmar

1. **Idade mínima.** Os documentos dizem 18 anos. Alternativa: 16 anos com consentimento específico (art. 14 da LGPD).
2. **Dados de saúde.** A Zenc não pede dados de saúde, mas o campo de observações pode receber alergias e similares
   (art. 11 da LGPD). Hoje o texto responsabiliza o estabelecimento (controlador). Confirmar se basta ou se é preciso um aviso
   no próprio campo.
3. **Prazos de retenção.** Registros de acesso: 6 meses (Marco Civil, art. 15). Dados de erro (Sentry): "em geral até 90 dias".
   Registros de atendimento: "prazo definido pelo estabelecimento". Confirmar os três.
4. **Prazo de 48 horas.** Aviso de incidente ao estabelecimento em até 48 horas após a Zenc confirmar o incidente, para que ele
   cumpra os 3 dias úteis da Resolução CD/ANPD nº 15/2024. Confirmar o prazo e a redação.
5. **Dados da empresa e foro.** Os textos citam só o nome "Zenc". O advogado informa razão social, CNPJ e endereço (que entram
   na versão oficial dos três documentos) e confirma o foro: hoje o foro do domicílio do usuário nos Termos e o do domicílio do
   Estabelecimento no Contrato; a alternativa é eleger uma comarca.
6. **Resoluções da ANPD.** Verificar os números e o conteúdo atual das Resoluções CD/ANPD nº 15/2024 (comunicação de incidentes)
   e nº 2/2022 (agentes de pequeno porte).
7. **Papéis controlador / operador.** Confirmar a divisão: Zenc controladora da conta, dos logs e dos erros; estabelecimento
   controlador dos registros de atendimento, com a Zenc operadora (art. 39).
8. **Transferência internacional.** Confirmar a base (art. 33) e as cláusulas com Supabase, Cloudflare, Resend, Sentry e os
   serviços de push (Expo, Google, Apple, Mozilla).
9. **Preço.** O Contrato diz "primeiro mês gratuito, depois conforme proposta comercial". Confirmar se o contrato deve citar valores.
10. **Aceite por clique.** O dono aceita o Contrato do Estabelecimento por clique no checklist de abertura. Confirmar a validade
    e o registro (a tabela `consents` guarda usuário, documento, versão e data/hora).
