--:THESTRING='A1'
--:THEDATE=10/10/2010
SELECT :THESTRING AS STRINGVAL,
       :THEDATE AS DATEVAL
FROM DUAL

select to_date('00:00:00', 'HH24:MI:SS') from dual


select sysdate from dual