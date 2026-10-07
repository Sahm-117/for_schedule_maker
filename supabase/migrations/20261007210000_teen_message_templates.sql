-- Teen message templates: to the teen (category TEEN) and to their parent or guardian
-- (category TEEN_PARENT). Shown only on a teen's card (FLOW_MAP rule 27).
-- {{parent_name}} falls back to "Sir/Ma"; {{group_link}} blocks sending until the
-- Teen Support has saved their WhatsApp group link on My Group.
--
-- Rollback: DELETE FROM "MessageTemplate" WHERE category IN ('TEEN', 'TEEN_PARENT') AND "useCase" <> 'Teen welcome';

INSERT INTO "MessageTemplate" ("useCase", body, "whenToUse", category)
SELECT v.use_case, v.body, v.when_to_use, v.category
FROM (VALUES
  ('Teen: First message',
   E'Hello {{first_name}}! This is {{user.name}} from Foundation of Faith, The Covenant Nation (TCN) Ikorodu. Congratulations on registering!\n\nI will be your support through the programme. Please reply so I know you got this, and I will add you to our WhatsApp group.',
   'Your very first message to a teen, before the group exists.', 'TEEN'),
  ('Teen: No reply',
   E'Hello {{first_name}}, it is {{user.name}} from Foundation of Faith again. I just want to be sure you got my earlier message.\n\nPlease reply "Yes" so I can add you to our WhatsApp group. God bless you.',
   'A teen has not answered your first message.', 'TEEN'),
  ('Teen: Reminder',
   E'Hi {{first_name}}! Foundation of Faith is starting soon. Please join our WhatsApp group so you do not miss anything:\n{{group_link}}',
   'A teen is in the group list but has not joined, or class is close.', 'TEEN'),
  ('Teen: Not joining',
   E'Hello {{first_name}}, are you still planning to join Foundation of Faith? If not, no problem, just let me know. The door is open any time.',
   'You cannot tell whether a teen still wants to come.', 'TEEN'),
  ('Parent: First message',
   E'Good day {{parent_name}}. I am {{user.name}} from Foundation of Faith, The Covenant Nation (TCN) Ikorodu. {{first_name}} registered for the programme and I will be their support.\n\nIs this WhatsApp number good for adding {{first_name}} to our group, or is there another number you would prefer? Thank you.',
   'Your first message when the number you have is the parent''s or guardian''s.', 'TEEN_PARENT'),
  ('Parent: No reply',
   E'Good day {{parent_name}}, I am {{user.name}} from Foundation of Faith, following up on my earlier message about {{first_name}}''s registration.\n\nPlease let me know if this WhatsApp number is good for adding {{first_name}} to our group, or if there is another number, and when it is convenient to speak. Thank you.',
   'A parent or guardian has not answered your first message.', 'TEEN_PARENT'),
  ('Parent: Welcome (added to group)',
   E'Good day {{parent_name}}. {{first_name}} has been added to our Foundation of Faith WhatsApp group:\n{{group_link}}\n\nPlease feel free to reach me on this number any time. Thank you.',
   'After the teen is in the group and you have saved the group link.', 'TEEN_PARENT'),
  ('Parent: Reminder',
   E'Good day {{parent_name}}. A reminder that Foundation of Faith is starting soon for {{first_name}}. Please make sure {{first_name}} has joined our WhatsApp group:\n{{group_link}}\n\nThank you.',
   'The teen has not joined the group, or class is close.', 'TEEN_PARENT'),
  ('Parent: Not joining',
   E'Good day {{parent_name}}, we have not been able to reach {{first_name}} about Foundation of Faith. Is {{first_name}} still joining? If not, please let us know. They are welcome any time. Thank you.',
   'You cannot tell whether the teen still wants to come.', 'TEEN_PARENT')
) AS v(use_case, body, when_to_use, category)
WHERE NOT EXISTS (SELECT 1 FROM "MessageTemplate" t WHERE t."useCase" = v.use_case);
