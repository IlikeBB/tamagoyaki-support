"""A paginated, permission-filtered view of landmark and task feedback."""
import time


def feedback_history(c,uid,viewer,kind,offset):
    selections=[];params=[]
    for source,records,reviews,live,key in (
        ('pin','landmark_records','landmark_reviews','pins','pin'),
        ('task','task_feedback_records','task_reviews','tasks','task'),
    ):
        if kind=='received':
            join='';extra='NULL AS value,r.created AS updated'
            reviewed=f'EXISTS(SELECT 1 FROM {reviews} v WHERE v.{key}=r.{key})'
            condition=f"(r.invalidated=1 OR {reviewed})" if source=='pin' else reviewed
            where=f'''r.owner=? AND {condition} AND (?=? OR EXISTS(
              SELECT 1 FROM members m WHERE m.user=? AND m.expedition=r.expedition))'''
            params.extend((uid,uid,viewer,viewer))
        else:
            join=f'JOIN {reviews} v ON v.{key}=r.{key}'
            extra='v.value,v.updated';where='v.voter=?';params.append(uid)
        invalidated='r.invalidated' if source=='pin' else '0'
        status='NULL' if source=='pin' else 'COALESCE(p.status,r.status)'
        help_active='0' if source=='pin' else 'COALESCE(p.help_active,0)'
        legacy_pin='r.pin' if source=='pin' else 'NULL'
        selections.append(f'''SELECT '{source}' AS source,r.{key} AS id,{legacy_pin} AS pin,
          r.owner,r.expedition,r.title,r.kind,r.room_name,r.venue,r.event_date,r.created,
          {invalidated} AS invalidated,COALESCE(p.expires,r.expires) AS expires,p.id IS NULL AS removed,
          {status} AS status,{help_active} AS help_active,
          COALESCE((SELECT SUM(value=1) FROM {reviews} WHERE {key}=r.{key}),0) AS likes,
          COALESCE((SELECT SUM(value=-1) FROM {reviews} WHERE {key}=r.{key}),0) AS dislikes,{extra}
          FROM {records} r {join} LEFT JOIN {live} p ON p.id=r.{key} WHERE {where}''')
    union=' UNION ALL '.join(selections)
    total=c.execute('SELECT COUNT(*) FROM ('+union+')',params).fetchone()[0]
    order='updated' if kind=='given' else 'created'
    rows=[dict(row) for row in c.execute('SELECT * FROM ('+union+f') ORDER BY {order} DESC,id,source LIMIT 12 OFFSET ?',(*params,offset))]
    stamp=int(time.time())
    for row in rows:
        if row['source']=='pin' and row['expires']==0:row['expires']=None
        help_active=row.pop('help_active')
        row['active']=not row['removed'] and (row['expires'] is None or row['expires']>stamp or help_active)
        if row['source']=='task':row['active']=row['active'] and row['status'] in ('open','accepted')
        row['can_view']=bool(c.execute('SELECT 1 FROM members WHERE user=? AND expedition=?',(viewer,row['expedition'])).fetchone())
        if kind=='given' and viewer!=row['owner'] and not row['can_view']:
            row.pop('likes');row.pop('dislikes')
    return {'items':rows,'total':total,'next_offset':offset+len(rows) if offset+len(rows)<total else None}
